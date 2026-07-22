import { z } from 'zod'

/**
 * Same sentinel as the browser-agent's `UNLIMITED_CAP`, redeclared here rather than imported: the
 * whole point of this module is that memory does not depend on the agent. Importing the constant
 * from `browser-agent/` would reintroduce exactly the coupling being removed.
 */
export const MEMORY_UNLIMITED_CAP = -1

/**
 * MEMORY ENTITLEMENT — deliberately NOT part of `BrowserAgentCaps`.
 *
 * Memory is a cross-product capability, sold and used by EITHER product:
 *   - Intellisper Agent  → personal memory (USER scope)
 *   - Intellisper Studio → org memory (PLATFORM) + flow memory (FLOW)
 *
 * It previously lived inside `agentCaps`, which made it structurally a sub-field of the AGENT's
 * entitlement: a Studio-only platform could never resolve `memoryEnabled=true`, because the caps
 * resolver returns AGENT_CAPS_NONE whenever the agent door is shut. Hoisting it into its own blob is
 * what actually decouples the two — resolving memory fields out of `agentCaps` while ignoring the
 * agent door would leave Studio tiers having to populate an "agent caps" object to sell memory,
 * which is the same coupling wearing a different hat.
 *
 * Persisted as ONE jsonb column on `platform_plan` (`memoryCaps`), mirroring how `agentCaps` is
 * stored, so a plan change sets the whole entitlement atomically with no multi-column drift.
 */
export const MemoryRecallTier = z.enum(['free', 'pro', 'enterprise'])
export type MemoryRecallTier = z.infer<typeof MemoryRecallTier>

export const MemoryCaps = z.object({
    /**
     * The paid door. `false` = the plan has no memory at all: nothing is captured, nothing is
     * recalled, and every memory surface answers 402.
     *
     * Memory carries real recurring COGS (an embedding on every remembered fact AND every recall,
     * plus vector storage and index upkeep for the life of the account), so it is a paid capability
     * on both products rather than a free extra.
     */
    enabled: z.boolean(),
    /**
     * Max stored facts per user (0 = none; UNLIMITED_CAP = no limit). The depth lever: it bounds the
     * durable storage/index cost one account can accrue, which a monthly op cap cannot — a user can
     * sit at a low op rate forever and still hold a huge corpus.
     */
    maxFacts: z.number(),
    /** Recall depth tier — feeds `recallKForTier`. */
    recallTier: MemoryRecallTier,
    /** Monthly memory operations (remember/recall). `0` = not included; UNLIMITED_CAP = no limit. */
    monthlyOps: z.number(),
})
export type MemoryCaps = z.infer<typeof MemoryCaps>

/** No memory on this plan — every memory capability is closed. */
export const MEMORY_CAPS_NONE: MemoryCaps = {
    enabled: false,
    maxFacts: 0,
    recallTier: 'free',
    monthlyOps: 0,
}

/** Entry paid tier (Agent Starter / Studio Starter): memory on, modest corpus. */
export const MEMORY_CAPS_STARTER: MemoryCaps = {
    enabled: true,
    maxFacts: 1000,
    recallTier: 'free',
    monthlyOps: 2000,
}

/** Pro tier: deeper recall and a much larger corpus. */
export const MEMORY_CAPS_PRO: MemoryCaps = {
    enabled: true,
    maxFacts: 10000,
    recallTier: 'pro',
    monthlyOps: 10000,
}

/**
 * Team tier: org/flow memory is shared team knowledge, so the corpus is naturally larger than one
 * person's.
 */
export const MEMORY_CAPS_TEAM: MemoryCaps = {
    enabled: true,
    maxFacts: 50000,
    recallTier: 'pro',
    monthlyOps: 10000,
}

/** Enterprise edition — unlimited by contract; self-hosted brings its own keys and database. */
export const MEMORY_CAPS_ENTERPRISE: MemoryCaps = {
    enabled: true,
    maxFacts: MEMORY_UNLIMITED_CAP,
    recallTier: 'enterprise',
    monthlyOps: MEMORY_UNLIMITED_CAP,
}
