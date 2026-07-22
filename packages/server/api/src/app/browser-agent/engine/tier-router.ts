import type { ModelTier } from '../model-provider/model-provider.config'
import type { RunCheckpoint } from './agent-engine.types'

/**
 * Pure stall-based cost routing. The loop runs on the cheap `default` (Haiku) tier and steps UP
 * only when the cheaper tier STALLED (a turn producing neither a tool call nor final text):
 *   0 stalls → default (Haiku)
 *   1+ stall → escalation (Sonnet)
 *   2+ stalls AND reasoningAllowed → reasoning (Opus)
 * Opus never fires on the default path and never when not allowed (Midi/Free).
 */
export const tierRouter = {
    pickTier(cp: RunCheckpoint, reasoningAllowed: boolean): ModelTier {
        const stalls = cp.escalation?.consecutiveStalls ?? 0
        if (stalls >= 2 && reasoningAllowed) return 'reasoning'
        if (stalls >= 1) return 'escalation'
        return 'default'
    },

    /**
     * Record a step outcome for routing. A productive turn (tool call or final text) resets the
     * stall counter; an empty turn increments it and bumps the monitoring counter for the tier we
     * were on (so escalation rate is queryable at run end).
     */
    recordTurnOutcome(cp: RunCheckpoint, tier: ModelTier, productive: boolean): void {
        const esc = cp.escalation ?? { consecutiveStalls: 0, escalations: 0, reasoningEscalations: 0 }
        if (productive) {
            esc.consecutiveStalls = 0
        }
        else {
            esc.consecutiveStalls += 1
            if (tier === 'default') esc.escalations += 1
            else if (tier === 'escalation') esc.reasoningEscalations += 1
        }
        cp.escalation = esc
    },
}
