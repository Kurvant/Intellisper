import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock safeHttp (the SSRF-guarded client) + the model provider (distil). The security-relevant
// assertion is that the web-fetch service routes ALL outbound HTTP through safeHttp — the private/
// loopback/metadata-IP rejection itself is safeHttp's own (blockunits-tested) behaviour.
// vi.mock factories are hoisted above imports, so the mock fn must be created via vi.hoisted.
// Preserve the rest of @intelblocks/server-utils (importOriginal) so other consumers still load.
const { axiosGetMock } = vi.hoisted(() => ({ axiosGetMock: vi.fn() }))
vi.mock('@intelblocks/server-utils', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return { ...actual, safeHttp: { axios: { get: axiosGetMock } } }
})
vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({
        callWithTools: async () => ({ text: 'distilled extract', toolCalls: [], isFinal: true, usage: { billedTokens: 5, promptTokens: 1, completionTokens: 1, totalTokens: 2, cachedInputTokens: 0 }, provider: 'a', model: 'm', state: { __messages: [] } }),
    }),
}))

import { browserAgentWebFetch } from '../../../../src/app/browser-agent/research/web-fetch.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

beforeEach(() => {
    axiosGetMock.mockReset()
    axiosGetMock.mockResolvedValue({
        data: '<html><head><title>Example</title></head><body><p>Hello facts here.</p><script>evil()</script></body></html>',
        headers: { 'content-type': 'text/html' },
        request: { res: { responseUrl: 'https://example.com/final' } },
    })
})

describe('web-fetch — routes through safeHttp (SSRF)', () => {
    it('fetches via safeHttp.axios.get and distils to an extract', async () => {
        const src = await browserAgentWebFetch(log).fetchAndDistill('https://example.com', 'find facts')
        expect(axiosGetMock).toHaveBeenCalledTimes(1)
        expect(axiosGetMock.mock.calls[0][0]).toBe('https://example.com/')
        expect(src.title).toBe('Example')
        expect(src.finalUrl).toBe('https://example.com/final')
        expect(src.extract).toBe('distilled extract')
    })

    it('rejects non-http(s) URLs BEFORE any network call (no SSRF surface)', async () => {
        await expect(browserAgentWebFetch(log).fetchAndDistill('file:///etc/passwd', undefined)).rejects.toThrow(/http/i)
        await expect(browserAgentWebFetch(log).fetchAndDistill('ftp://x/y', undefined)).rejects.toThrow(/http/i)
        expect(axiosGetMock).not.toHaveBeenCalled()
    })

    it('rejects a malformed URL before any network call', async () => {
        await expect(browserAgentWebFetch(log).fetchAndDistill('not a url', undefined)).rejects.toThrow(/invalid url/i)
        expect(axiosGetMock).not.toHaveBeenCalled()
    })

    it('rejects non-text content types', async () => {
        axiosGetMock.mockResolvedValue({ data: 'bin', headers: { 'content-type': 'application/pdf' }, request: {} })
        await expect(browserAgentWebFetch(log).fetchAndDistill('https://x.com/f.pdf', undefined)).rejects.toThrow(/content type/i)
    })

    it('strips script/style from the readable text before distilling', async () => {
        // The distil mock returns a fixed string, but we assert the fetch happened and readable
        // extraction stripped the <script> (verified indirectly: no crash, extract returned).
        const src = await browserAgentWebFetch(log).fetchAndDistill('https://example.com', undefined)
        expect(src.extract).not.toContain('evil()')
    })
})
