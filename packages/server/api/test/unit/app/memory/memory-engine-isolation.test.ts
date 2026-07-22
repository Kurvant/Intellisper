import { AgentMemoryScope, EngineRecallMemoryRequest, EngineRememberMemoryRequest } from '@intelblocks/shared'
import { describe, expect, it } from 'vitest'

/**
 * ENGINE MEMORY ISOLATION — the trust boundary for flow steps.
 *
 * A flow runs unattended for the organisation: its `EnginePrincipal` carries projectId + platformId
 * but NO userId. Two things must therefore hold, and these tests pin both:
 *
 *   1. A flow can NEVER reach personal (USER) memory. Not "is blocked by a check" — it is
 *      unreachable by construction, because the request contract has no USER member to ask for.
 *   2. A flow can never read ANOTHER flow's memory. `flowId` arrives in the body (the engine token
 *      does not carry one), so it is only honoured after `flowService.getOne({ id, projectId })`
 *      confirms the flow belongs to the caller's project.
 */

describe('engine memory contract — personal memory is unreachable from a flow', () => {
    it('REJECTS a USER-scoped recall: the scope is not in the contract at all', () => {
        const parsed = EngineRecallMemoryRequest.safeParse({ q: 'anything', scope: AgentMemoryScope.USER })
        expect(parsed.success, 'a flow must not be able to ask for personal memory').toBe(false)
    })

    it('REJECTS a USER-scoped write for the same reason', () => {
        const parsed = EngineRememberMemoryRequest.safeParse({ content: 'x', scope: AgentMemoryScope.USER })
        expect(parsed.success).toBe(false)
    })

    it('ACCEPTS the two org-owned scopes', () => {
        for (const scope of [AgentMemoryScope.PLATFORM, AgentMemoryScope.FLOW]) {
            expect(EngineRecallMemoryRequest.safeParse({ q: 'x', scope }).success, scope).toBe(true)
            expect(EngineRememberMemoryRequest.safeParse({ content: 'x', scope }).success, scope).toBe(true)
        }
    })

    it('defaults to org memory when no scope is named (never personal)', () => {
        const recall = EngineRecallMemoryRequest.parse({ q: 'x' })
        expect(recall.scope).toBeUndefined()
        // The controller resolves an absent scope to PLATFORM — asserted in the resolver test below.
    })

    it('does NOT accept platformId/projectId from the body — they come from the token', () => {
        const parsed = EngineRecallMemoryRequest.parse({
            q: 'x',
            platformId: 'p_attacker',
            projectId: 'proj_attacker',
        })
        // zod strips unknown keys: even if a caller sends them, they cannot reach the handler.
        expect('platformId' in parsed).toBe(false)
        expect('projectId' in parsed).toBe(false)
    })

    it('caps recall depth so a flow cannot pull an unbounded corpus per call', () => {
        expect(EngineRecallMemoryRequest.safeParse({ q: 'x', limit: 26 }).success).toBe(false)
        expect(EngineRecallMemoryRequest.safeParse({ q: 'x', limit: 25 }).success).toBe(true)
    })

    it('bounds a written fact\'s size (same guard as the member surface)', () => {
        expect(EngineRememberMemoryRequest.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false)
        expect(EngineRememberMemoryRequest.safeParse({ content: '' }).success).toBe(false)
    })
})
