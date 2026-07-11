import {
    IntellisperError, IntellisperProviderAuthConfig, AIProviderAuthConfig, AIProviderConfig, AIProviderModel, AIProviderName, AIProviderWithoutSensitiveData,
    ibId,
    BaseAIProviderAuthConfig,
    BedrockProviderAuthConfig,
    BedrockProviderConfig,
    CreateAIProviderRequest,
    ErrorCode,
    GetProviderConfigResponse,
    isNil,
    PlatformId,
    spreadIfDefined,
    UpdateAIProviderRequest,
} from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import cron from 'node-cron'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { openRouterApi } from '../enterprise/platform/platform-plan/openrouter/openrouter-api'
import { platformPlanService } from '../enterprise/platform/platform-plan/platform-plan.service'
import { flagService } from '../flags/flag.service'
import { encryptUtils } from '../helper/encryption'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { AIProviderEntity, AIProviderSchema } from './ai-provider-entity'
import { aiProviders } from './providers'

const aiProviderRepo = repoFactory<AIProviderSchema>(AIProviderEntity)

const modelsCache = new Map<string, AIProviderModel[]>()

export const aiProviderService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        cron.schedule('0 0 * * *', () => {
            log.info('Clearing AI provider models cache')
            modelsCache.clear()
        })
    },

    async listProviders(platformId: PlatformId): Promise<AIProviderWithoutSensitiveData[]> {
        const intellisperExists = await aiProviderRepo().existsBy({
            platformId,
            provider: AIProviderName.INTELLISPER,
        })

        if (flagService(log).aiCreditsEnabled() && !intellisperExists) {
            await aiProviderRepo().save({
                id: ibId(),
                auth: await encryptUtils.encryptObject({}),
                config: {},
                provider: AIProviderName.INTELLISPER,
                displayName: 'Intellisper',
                platformId,
            })
        }
        const configuredProviders = await aiProviderRepo().findBy({ platformId })

        return configuredProviders.map((p): AIProviderWithoutSensitiveData => ({
            id: p.id,
            name: p.displayName,
            provider: p.provider,
            config: p.config,
            enabledForChat: p.enabledForChat ?? false,
        }))
    },

    async listModels(platformId: PlatformId, provider: AIProviderName): Promise<AIProviderModel[]> {
        const { config, auth } = await this.getConfigOrThrow({ platformId, provider })

        const cacheKey = `${provider}-${getAuthCacheFingerprint({ provider, auth, config })}`
        if (modelsCache.has(cacheKey) && !('models' in config)) {
            return modelsCache.get(cacheKey)!
        }

        const data = await aiProviders[provider].listModels(auth, config)

        modelsCache.set(cacheKey, data.map(model => ({
            id: model.id,
            name: model.name,
            type: model.type,
        })))

        return modelsCache.get(cacheKey)!
    },

    async create(platformId: PlatformId, request: CreateAIProviderRequest): Promise<void> {
        await this.validateProviderCredentials(request.provider, request.auth, request.config)
        await aiProviderRepo().save({
            id: ibId(),
            auth: await encryptUtils.encryptObject(request.auth),
            config: request.config,
            provider: request.provider,
            displayName: request.displayName,
            platformId,
        })
    },
    async update(platformId: PlatformId, providerId: string, request: UpdateAIProviderRequest): Promise<void> {
        const aiProvider = await aiProviderRepo().findOneBy({
            platformId,
            id: providerId,
        })
        if (isNil(aiProvider)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityId: providerId, entityType: 'AIProvider' },
            })
        }

        if (aiProvider.provider === AIProviderName.INTELLISPER) {
            if (request.enabledForChat === true) {
                await aiProviderRepo().manager.transaction(async (manager) => {
                    await manager.update(AIProviderEntity, { platformId }, { enabledForChat: false })
                    await manager.update(AIProviderEntity, providerId, { enabledForChat: true })
                })
            }
            return
        }

        const config = request.config ?? aiProvider.config
        if (!isNil(request.auth)) {
            await this.validateProviderCredentials(aiProvider.provider, request.auth, config)
        }
        else {
            const { auth } = await this.getConfigOrThrow({ platformId, provider: aiProvider.provider })
            await this.validateProviderCredentials(aiProvider.provider, auth, config)
        }

        const encryptedAuth = !isNil(request.auth) ? await encryptUtils.encryptObject(request.auth) : undefined
        const updates = {
            ...spreadIfDefined('auth', encryptedAuth),
            ...spreadIfDefined('config', request.config),
            ...spreadIfDefined('enabledForChat', request.enabledForChat),
            displayName: request.displayName,
        }

        if (request.enabledForChat === true) {
            await aiProviderRepo().manager.transaction(async (manager) => {
                await manager.update(AIProviderEntity, { platformId }, { enabledForChat: false })
                await manager.update(AIProviderEntity, providerId, updates)
            })
        }
        else {
            await aiProviderRepo().update(providerId, updates)
        }
    },

    async getChatProvider({ platformId }: { platformId: PlatformId }): Promise<GetProviderConfigResponse | null> {
        const chatProvider = await aiProviderRepo().findOneBy({ platformId, enabledForChat: true })
        if (isNil(chatProvider)) {
            return null
        }
        let auth = await encryptUtils.decryptObject<AIProviderAuthConfig>(chatProvider.auth)
        if (chatProvider.provider === AIProviderName.INTELLISPER) {
            const doesHaveKeys = !isNil(auth) && 'apiKey' in auth && !isNil(auth.apiKey) && auth.apiKey !== ''
            if (!doesHaveKeys) {
                const enriched = await enrichWithKeysIfNeeded(chatProvider, platformId, log)
                auth = enriched.auth
            }
        }
        return { provider: chatProvider.provider, auth, config: chatProvider.config, platformId }
    },

    // Thin read of the platform's chat provider NAME only (no auth/config decryption). Used by chat
    // telemetry to label events without touching secret material. Returns null when no provider is
    // enabled for chat.
    async getChatProviderName({ platformId }: { platformId: PlatformId }): Promise<AIProviderName | null> {
        const chatProvider = await aiProviderRepo().findOneBy({ platformId, enabledForChat: true })
        return chatProvider?.provider ?? null
    },

    async delete(platformId: PlatformId, providerId: string): Promise<void> {
        await aiProviderRepo().delete({
            platformId,
            id: providerId,
        })
    },
    async validateProviderCredentials(provider: AIProviderName, auth: AIProviderAuthConfig, config: AIProviderConfig): Promise<void> {
        const providerStrategy = aiProviders[provider]
        try {
            await providerStrategy.validateConnection(auth, config, log)
        }
        catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            const includeHttpErrorInMessage = provider === AIProviderName.CLOUDFLARE_GATEWAY
            log.error({ err: error }, '[aiProviderService#validateProviderCredentials] Failed to validate provider credentials')
            throw new IntellisperError({
                code: ErrorCode.INVALID_AI_PROVIDER_CREDENTIALS,
                params: {
                    provider,
                    message: includeHttpErrorInMessage
                        ? `Failed to validate credentials for ${providerStrategy.name}, ${errorMessage}`
                        : `Failed to validate credentials for ${providerStrategy.name}`,
                    httpErrorResponse: errorMessage,
                },
            })
        }
    },
    async getConfigOrThrow({ platformId, provider }: GetOrCreateIntellisperConfigResponse): Promise<GetProviderConfigResponse> {
        const aiProvider = await aiProviderRepo().findOneBy({
            platformId,
            provider,
        })
        if (isNil(aiProvider)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: provider,
                    entityType: 'AIProvider',
                },
            })
        }

        let auth = await encryptUtils.decryptObject<AIProviderAuthConfig>(aiProvider.auth)

        if (aiProvider.provider === AIProviderName.INTELLISPER) {
            const doesHaveKeys = !isNil(auth) && 'apiKey' in auth && !isNil(auth.apiKey) && auth.apiKey !== ''
            if (!doesHaveKeys) {
                const { auth: intellisperAuth } = await enrichWithKeysIfNeeded(aiProvider, platformId, log)

                auth = intellisperAuth
            }

        }


        return { provider: aiProvider.provider, auth, config: aiProvider.config, platformId }
    },
    async getIntellisperProviderIfEnriched(platformId: PlatformId): Promise<IntellisperProviderAuthConfig | null> {
        const aiProvider = await aiProviderRepo().findOneBy({
            platformId,
            provider: AIProviderName.INTELLISPER,
        })
        if (isNil(aiProvider)) {
            return null
        }
        const doesHaveKeys = await doesIntellisperProviderHasKeys(aiProvider)
        if (!doesHaveKeys) {
            return null
        }
        const { auth } = await this.getConfigOrThrow({ platformId, provider: aiProvider.provider })

        return auth as IntellisperProviderAuthConfig
    },

    async getOrCreateIntellisperProviderAuthConfig(platformId: PlatformId): Promise<IntellisperProviderAuthConfig> {
        const aiProvider = await aiProviderRepo().findOneBy({
            platformId,
            provider: AIProviderName.INTELLISPER,
        })
        if (isNil(aiProvider)) {
            await aiProviderRepo().save({
                id: ibId(),
                auth: await encryptUtils.encryptObject({}),
                config: {},
                provider: AIProviderName.INTELLISPER,
                displayName: 'Intellisper',
                platformId,
            })
        }

        const { auth } = await this.getConfigOrThrow({ platformId, provider: AIProviderName.INTELLISPER })
        const intellisperAuth = auth as IntellisperProviderAuthConfig
        rejectedPromiseHandler(systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.AI_CREDIT_UPDATE_CHECK,
                data: { apiKeyHash: intellisperAuth.apiKeyHash, platformId },
                jobId: `ai-credit-update-check-${platformId}`,
            },
            schedule: {
                type: 'one-time',
                date: dayjs(),
            },
        }), log)
        return intellisperAuth
    },

    async getAllIntellisperProvidersConfigs(platformIds?: string[]): Promise<{ [platformId: string]: IntellisperProviderAuthConfig }> {
        const aiProviders = await aiProviderRepo().find({
            where: {
                provider: AIProviderName.INTELLISPER,
                platformId: platformIds?.length ? In(platformIds) : undefined,
            },
        })

        const result: { [platformId: string]: IntellisperProviderAuthConfig } = {}
        for (const aiProvider of aiProviders) {
            const hasKeys = await doesIntellisperProviderHasKeys(aiProvider)
            if (!hasKeys) continue

            result[aiProvider.platformId] = await encryptUtils.decryptObject<IntellisperProviderAuthConfig>(aiProvider.auth)
        }

        return result
    },
})

type GetOrCreateIntellisperConfigResponse = {
    platformId: PlatformId
    provider: AIProviderName
}

async function enrichWithKeysIfNeeded(aiProvider: AIProviderSchema, platformId: PlatformId, log: FastifyBaseLogger): Promise<GetProviderConfigResponse> {
    const platformPlan = await platformPlanService(log).getOrCreateForPlatform(platformId)
    const limit = platformPlan.includedAiCredits / 1000
    const { key, data } = await openRouterApi.createKey({
        name: `Platform ${platformId}`, 
        limit,
    })
    const rawAuth: IntellisperProviderAuthConfig = { apiKey: key, apiKeyHash: data.hash }
    const savedAiProvider = await aiProviderRepo().save({
        id: aiProvider.id,
        platformId,
        provider: AIProviderName.INTELLISPER,
        displayName: 'Intellisper',
        config: {},
        auth: await encryptUtils.encryptObject(rawAuth),
    })
    await platformPlanService(log).update({
        platformId,
        lastFreeAiCreditsRenewalDate: new Date().toISOString(),
    })
    return { provider: savedAiProvider.provider, auth: rawAuth, config: savedAiProvider.config, platformId }
}


async function doesIntellisperProviderHasKeys(aiProvider: AIProviderSchema): Promise<boolean> {
    if (isNil(aiProvider) || isNil(aiProvider.auth)) {
        return false
    }
    const decryptedAuth = await encryptUtils.decryptObject<IntellisperProviderAuthConfig>(aiProvider.auth)
    return !isNil(decryptedAuth) && !isNil(decryptedAuth.apiKey) && decryptedAuth.apiKey !== ''
}

function getAuthCacheFingerprint({ provider, auth, config }: { provider: AIProviderName, auth: AIProviderAuthConfig, config: AIProviderConfig }): string {
    switch (provider) {
        case AIProviderName.BEDROCK: {
            const { accessKeyId, secretAccessKey } = auth as BedrockProviderAuthConfig
            const { region } = config as BedrockProviderConfig
            return `${accessKeyId}-${secretAccessKey}-${region}`
        }
        default: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            return apiKey
        }
    }
}
