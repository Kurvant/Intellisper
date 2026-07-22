import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

/**
 * Browser-agent model-provider configuration. Tier model ids come from env (system props) with
 * sane defaults; the two provider keys are server-side only. This is deliberately SEPARATE from
 * blockunits' per-platform `ai_provider` stack — the browser agent has its own tiering, prompt
 * caching, and billed-token metering contract.
 *
 * Tiers (cost routing — see the engine's stall-based escalation):
 *  - default    : the cheap workhorse (Haiku) for routine tool-calling steps.
 *  - escalation : a stronger model (Sonnet) when the cheap tier stalls.
 *  - reasoning  : the strongest (Opus), gated to Max/Enterprise, for repeated stalls.
 *  - fallback   : a different vendor (OpenAI) for transparent failover before the first token.
 *  - distill    : cheap high-volume summarisation (research/memory/self-heal).
 */
export type ModelTier = 'default' | 'escalation' | 'reasoning' | 'fallback' | 'distill'

export type TierModel = {
    provider: 'anthropic' | 'openai'
    model: string
}

/** Embedding model + dimension — the SINGLE source of truth read by both memory SQL + provider. */
export const BROWSER_AGENT_EMBEDDING_DIMENSIONS = 1536

function envOr(prop: AppSystemProp, fallback: string): string {
    return system.get(prop) ?? fallback
}

export const browserAgentModelConfig = {
    anthropicApiKey(): string | undefined {
        return system.get(AppSystemProp.BROWSER_AGENT_ANTHROPIC_API_KEY)
    },
    openaiApiKey(): string | undefined {
        return system.get(AppSystemProp.BROWSER_AGENT_OPENAI_API_KEY)
    },
    tierModel(tier: ModelTier): TierModel {
        switch (tier) {
            case 'default':
                return { provider: 'anthropic', model: envOr(AppSystemProp.BROWSER_AGENT_DEFAULT_MODEL, 'claude-haiku-4-5') }
            case 'escalation':
                return { provider: 'anthropic', model: envOr(AppSystemProp.BROWSER_AGENT_ESCALATION_MODEL, 'claude-sonnet-4-6') }
            case 'reasoning':
                return { provider: 'anthropic', model: envOr(AppSystemProp.BROWSER_AGENT_REASONING_MODEL, 'claude-opus-4-6') }
            case 'fallback':
                return { provider: 'openai', model: envOr(AppSystemProp.BROWSER_AGENT_FALLBACK_MODEL, 'gpt-4o') }
            case 'distill':
                return { provider: 'anthropic', model: envOr(AppSystemProp.BROWSER_AGENT_DISTILL_MODEL, 'claude-haiku-4-5') }
        }
    },
    embeddingModel(): string {
        return envOr(AppSystemProp.BROWSER_AGENT_EMBEDDING_MODEL, 'text-embedding-3-small')
    },
}

/**
 * Map a tier's provider+model to the OpenRouter-namespaced model id used when routing through the
 * managed credit rail (e.g. `anthropic/claude-haiku-4.5`, `openai/gpt-4o`). OpenRouter addresses
 * models as `<provider>/<model>`; the native env ids are already the bare model names, so we only
 * prefix the provider slug (idempotent if an id is already namespaced). This is the ONLY difference
 * between managed and env model addressing — tiers, caching, and billed-token accounting are shared.
 */
export function toOpenRouterModelId(tierModel: TierModel): string {
    if (tierModel.model.includes('/')) {
        return tierModel.model
    }
    return `${tierModel.provider}/${tierModel.model}`
}
