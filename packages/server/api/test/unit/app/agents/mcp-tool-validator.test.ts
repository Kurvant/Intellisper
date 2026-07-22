import { AgentToolType, McpAuthType, McpProtocol } from '@intelblocks/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The validator dials an untrusted, user-supplied MCP server, so this suite exists to pin its SAFETY
 * properties: SSRF containment (all traffic goes through safeHttp), no redirect following, a hard
 * response-size cap, a bounded timeout, and a generic error that never leaks the upstream failure.
 *
 * NOTE ON THE MOCK: the validator drives the real MCP SDK `Client` over a
 * `StreamableHTTPClientTransport` whose `fetch` is a shim around `safeHttp.axios.request`. So the seam
 * to mock is `safeHttp.axios.request` — a single config object in, an axios-shaped response out.
 * (An earlier version of this suite mocked `safeHttp.retryingAxios.post`, which the implementation
 * has not called for some time; every request therefore hit `undefined.post` and was swallowed by the
 * validator's catch-all, so the whole file was asserting the generic-error path by accident.)
 */

// vi.mock's factory is hoisted above every top-level const, so the mock fn must be created inside
// vi.hoisted() or it would not exist yet when the factory runs.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))

vi.mock('@intelblocks/server-utils', () => ({
    safeHttp: { axios: { request: requestMock } },
}))

import { mcpToolValidator } from '../../../../src/app/agents/mcp-tool-validator'

type AxiosRequestConfigLike = {
    url?: string
    method?: string
    headers?: Record<string, string>
    data?: unknown
    timeout?: number
    maxRedirects?: number
    maxContentLength?: number
    maxBodyLength?: number
}

const GENERIC_ERROR = 'Could not validate MCP server. Check the URL, authentication, and that the server is reachable.'

describe('mcpToolValidator.validateAgentMcpTool', () => {
    beforeEach(() => {
        requestMock.mockReset()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the tool names advertised by the server', async () => {
        mockMcpServer({ tools: [{ name: 'a' }, { name: 'b' }] })

        const result = await mcpToolValidator.validateAgentMcpTool(buildTool())

        expect(result.error).toBeUndefined()
        expect(result.toolNames).toEqual(['a', 'b'])
    })

    it('parses an SSE (text/event-stream) response', async () => {
        // Streamable HTTP servers may answer with SSE rather than plain JSON; both must work.
        mockMcpServer({ tools: [{ name: 'streamed' }], sse: true })

        const result = await mcpToolValidator.validateAgentMcpTool(
            buildTool({ protocol: McpProtocol.STREAMABLE_HTTP }),
        )

        expect(result.error).toBeUndefined()
        expect(result.toolNames).toEqual(['streamed'])
    })

    it('performs the MCP handshake before listing tools', async () => {
        mockMcpServer({ tools: [] })

        await mcpToolValidator.validateAgentMcpTool(buildTool())

        const methods = sentMethods()
        expect(methods[0]).toBe('initialize')
        expect(methods).toContain('tools/list')
        // The initialized notification must precede the first real call.
        expect(methods.indexOf('notifications/initialized')).toBeLessThan(methods.indexOf('tools/list'))
    })

    it('routes ALL traffic through safeHttp (SSRF containment) with a size cap and a bounded timeout', async () => {
        mockMcpServer({ tools: [] })

        await mcpToolValidator.validateAgentMcpTool(buildTool())

        const call = sentCalls()[0]
        // Any request that did not go through safeHttp would bypass the private-IP/metadata blocking.
        expect(requestMock).toHaveBeenCalled()
        expect(call.maxContentLength).toBe(64 * 1024)
        expect(call.maxBodyLength).toBe(64 * 1024)
        expect(call.timeout).toBe(15_000)
    })

    it('collapses ANY downstream failure into one generic error (never leaks the upstream detail)', async () => {
        requestMock.mockRejectedValue(
            Object.assign(new Error('ENOTFOUND attacker.example'), { code: 'ENOTFOUND' }),
        )

        const result = await mcpToolValidator.validateAgentMcpTool(buildTool())

        expect(result.toolNames).toBeUndefined()
        expect(result.error).toBe(GENERIC_ERROR)
        // The upstream host/error must not reach the caller — that is an information leak.
        expect(result.error).not.toMatch(/ENOTFOUND/i)
        expect(result.error).not.toMatch(/attacker/i)
    })

    it('rejects a malformed URL WITHOUT dialing', async () => {
        const result = await mcpToolValidator.validateAgentMcpTool(
            buildTool({ serverUrl: 'not a url' }),
        )

        expect(result.toolNames).toBeUndefined()
        expect(result.error).toBe(GENERIC_ERROR)
        expect(requestMock).not.toHaveBeenCalled()
    })

    it('rejects a non-http(s) scheme WITHOUT dialing (file:// would read the local disk)', async () => {
        const result = await mcpToolValidator.validateAgentMcpTool(
            buildTool({ serverUrl: 'file:///etc/passwd' }),
        )

        expect(result.toolNames).toBeUndefined()
        expect(result.error).toBe(GENERIC_ERROR)
        expect(requestMock).not.toHaveBeenCalled()
    })

    describe('auth header mapping', () => {
        it('forwards an API-key header', async () => {
            mockMcpServer({ tools: [] })

            await mcpToolValidator.validateAgentMcpTool(
                buildTool({
                    auth: { type: McpAuthType.API_KEY, apiKey: 'secret-123', apiKeyHeader: 'X-API-Key' },
                }),
            )

            expect(sentCalls()[0].headers?.['X-API-Key']).toBe('secret-123')
        })

        it('forwards a Bearer access token', async () => {
            mockMcpServer({ tools: [] })

            await mcpToolValidator.validateAgentMcpTool(
                buildTool({ auth: { type: McpAuthType.ACCESS_TOKEN, accessToken: 'tok-abc' } }),
            )

            expect(sentCalls()[0].headers?.['Authorization']).toBe('Bearer tok-abc')
        })
    })
})

type DefaultTool = {
    type: AgentToolType.MCP
    toolName: string
    serverUrl: string
    protocol: McpProtocol
    auth:
    | { type: McpAuthType.NONE }
    | { type: McpAuthType.API_KEY, apiKey: string, apiKeyHeader: string }
    | { type: McpAuthType.ACCESS_TOKEN, accessToken: string }
    | { type: McpAuthType.HEADERS, headers: Record<string, string> }
}

function buildTool(overrides: Partial<DefaultTool> = {}): DefaultTool {
    return {
        type: AgentToolType.MCP,
        toolName: 'unit-test',
        serverUrl: 'https://mcp.example.com/rpc',
        protocol: McpProtocol.SIMPLE_HTTP,
        auth: { type: McpAuthType.NONE },
        ...overrides,
    }
}

/** Every axios config the validator sent through safeHttp. */
function sentCalls(): AxiosRequestConfigLike[] {
    return requestMock.mock.calls.map(([config]) => (config ?? {}) as AxiosRequestConfigLike)
}

/** The JSON-RPC method of each request, in order. */
function sentMethods(): string[] {
    return sentCalls()
        .map((c) => {
            if (typeof c.data !== 'string') return undefined
            try {
                const parsed = JSON.parse(c.data)
                return Array.isArray(parsed) ? parsed[0]?.method : parsed.method
            }
            catch {
                return undefined
            }
        })
        .filter((m): m is string => typeof m === 'string')
}

/**
 * Stand in for a real MCP server speaking Streamable HTTP over the safeHttp shim.
 *
 * The shim wraps our reply in `new Response(Buffer.from(response.data), ...)`, so `data` must be an
 * ArrayBuffer-compatible payload and `headers` must carry the content-type the SDK dispatches on.
 */
function mockMcpServer({ tools, sse = false }: { tools: Array<{ name: string }>, sse?: boolean }): void {
    requestMock.mockImplementation(async (config: AxiosRequestConfigLike) => {
        const body = typeof config.data === 'string' ? safeParse(config.data) : undefined
        // A notification carries no id and expects 202 Accepted with no body.
        if (body !== undefined && body.id === undefined) {
            return { status: 202, data: encode(''), headers: {} }
        }

        const payload = body?.method === 'initialize'
            ? {
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    protocolVersion: '2025-03-26',
                    serverInfo: { name: 'mock', version: '0' },
                    capabilities: { tools: {} },
                },
            }
            : {
                jsonrpc: '2.0',
                id: body?.id,
                // The SDK validates tools/list against the MCP schema, and `inputSchema` is REQUIRED
                // on every tool. Omitting it makes the client reject the response, which the validator
                // then reports as its generic error — so the mock has to be spec-valid, not just
                // plausible.
                result: {
                    tools: tools.map((t) => ({
                        name: t.name,
                        inputSchema: { type: 'object', properties: {} },
                    })),
                },
            }

        if (sse) {
            return {
                status: 200,
                data: encode(`event: message\ndata: ${JSON.stringify(payload)}\n\n`),
                headers: { 'content-type': 'text/event-stream' },
            }
        }
        return {
            status: 200,
            data: encode(JSON.stringify(payload)),
            headers: { 'content-type': 'application/json' },
        }
    })
}

function safeParse(s: string): { id?: unknown, method?: string } | undefined {
    try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed[0] : parsed
    }
    catch {
        return undefined
    }
}

/** The validator asks axios for an arraybuffer, so answer in kind. */
function encode(s: string): ArrayBuffer {
    const buf = Buffer.from(s, 'utf8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
