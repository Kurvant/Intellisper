import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI, openai } from '@ai-sdk/openai'
import { createGoogleGenerativeAI, google } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAzure } from '@ai-sdk/azure'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { EmbeddingModel, ImageModel, LanguageModel } from 'ai'
import { ProviderOptions } from '@ai-sdk/provider-utils'
import { httpClient, HttpMethod } from '@intelblocks/blocks-common'
import { AiKeyMode, AIProviderName, AzureProviderConfig, BaseAIProviderAuthConfig, BedrockProviderAuthConfig, BedrockProviderConfig, CloudflareGatewayProviderConfig, GetProviderConfigResponse, OpenAICompatibleProviderConfig, splitCloudflareGatewayModelId } from '@intelblocks/shared'
import { type BlockUsageEmitter, meterBlockEmbeddingModel, meterBlockModel } from './ai-usage-meter'
import { createAiGateway } from 'ai-gateway-provider';
import { createAnthropic as createAnthropicGateway } from 'ai-gateway-provider/providers/anthropic';
import { createGoogleGenerativeAI as createGoogleGateway } from 'ai-gateway-provider/providers/google';
async function fetchProviderConfig(params: { provider: AIProviderName, engineToken: string, apiUrl: string }) {
    const { body } = await httpClient.sendRequest<GetProviderConfigResponse>({
        method: HttpMethod.GET,
        url: `${params.apiUrl}v1/ai-providers/${params.provider}/config`,
        headers: {
            Authorization: `Bearer ${params.engineToken}`,
        },
    })
    return body
}

type CreateAIModelParams<IsImage extends boolean = false> = {
    provider: AIProviderName;
    modelId: string;
    engineToken: string;
    projectId: string;
    flowId: string;
    runId: string;
    apiUrl: string;
    openaiResponsesModel?: boolean;
    isImage?: IsImage;
    /**
     * AI Gateway. When supplied, every model call made through the returned model is metered into the
     * platform's AI-cost ledger. Optional so a caller that has no run context still works unchanged —
     * but every real action passes it, because an unmetered AI call is money we cannot see.
     */
    usageMeter?: {
        /** Distinguishes steps within one run so their ledger idempotency keys cannot collide. */
        stepName: string;
        emit: BlockUsageEmitter;
    };
}

export function createAIModel(params: CreateAIModelParams<false>): Promise<LanguageModel>;
export function createAIModel(params: CreateAIModelParams<true>): Promise<ImageModel>;
export async function createAIModel(params: CreateAIModelParams<boolean>): Promise<ImageModel | LanguageModel> {
    // Fetch the provider config exactly ONCE and thread it through. Metering must add no work — a
    // second config fetch just to learn the platformId would be a real extra HTTP round-trip on the
    // flow's critical path, which is precisely what this design refuses to do.
    const providerConfig = await fetchProviderConfig({
        provider: params.provider,
        engineToken: params.engineToken,
        apiUrl: params.apiUrl,
    });

    const model = await buildAIModel(params, providerConfig);

    // AI Gateway — meter this block's AI call.
    //
    // Flow blocks are the largest previously-unmeasured plane: they call vendors DIRECTLY with a
    // decrypted key, so every token a customer's flow burned was real money that appeared in no cost
    // record at all.
    //
    // Image models are deliberately NOT metered here: they are priced per-image, not per-token, so
    // recording them in a token ledger would misstate them. That is a separate line item, and inventing
    // a fake token cost for it would be worse than the honest gap.
    if (params.isImage === true || params.usageMeter === undefined) {
        return model;
    }
    return meterBlockModel({
        model: model as LanguageModel,
        provider: params.provider,
        modelId: params.modelId,
        // The flow runs on the PLATFORM's configured provider key (fetched from the API), so this is
        // our cost against the customer's credits — not the customer's own vendor account.
        keyMode: AiKeyMode.MANAGED,
        context: {
            platformId: providerConfig.platformId,
            projectId: params.projectId,
            runId: params.runId,
            stepName: params.usageMeter.stepName,
        },
        emit: params.usageMeter.emit,
    });
}

async function buildAIModel(
    {
        provider,
        modelId,
        engineToken,
        projectId,
        flowId,
        runId,
        apiUrl,
        openaiResponsesModel = false,
        isImage,
    }: CreateAIModelParams<boolean>,
    providerConfig: Awaited<ReturnType<typeof fetchProviderConfig>>,
): Promise<ImageModel | LanguageModel> {
    const { config, auth, platformId } = providerConfig;

    switch (provider) {
        case AIProviderName.OPENAI: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const provider = createOpenAI({ apiKey })
            if (isImage) {
                return provider.imageModel(modelId)
            }
            return (openaiResponsesModel ? provider.responses(modelId) : provider.chat(modelId))
        }
        case AIProviderName.ANTHROPIC: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const provider = createAnthropic({ apiKey })
            if (isImage) {
                throw new Error(`Provider ${provider} does not support image models`)
            }
            return provider(modelId)
        }
        case AIProviderName.GOOGLE: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const provider = createGoogleGenerativeAI({ apiKey })

            return provider(modelId)
        }
        case AIProviderName.AZURE: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const { resourceName, apiVersion } = config as AzureProviderConfig
            const provider = createAzure({ resourceName, apiKey, apiVersion })
            if (isImage) {
                return provider.imageModel(modelId)
            }
            return provider.chat(modelId)
        }
        case AIProviderName.CLOUDFLARE_GATEWAY: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const { accountId, gatewayId,vertexProject,vertexRegion } = config as CloudflareGatewayProviderConfig
            const aigateway = createAiGateway({
                accountId: accountId,
                gateway: gatewayId,
                apiKey,
              });
            const { provider: providerPrefix, model: actualModelId, publisher } = splitCloudflareGatewayModelId(modelId)
            const cfMetadataHeaders = {
                'cf-aig-metadata': JSON.stringify({
                    projectId,
                    flowId,
                    runId,
                }),
            }

            const headers = {
                'cf-aig-authorization': `Bearer ${apiKey}`,
                ...cfMetadataHeaders,
            }
            switch (providerPrefix) {
                case 'anthropic': {
                    const anthropicProvider = createAnthropicGateway({
                        headers
                    });
                    return aigateway(anthropicProvider(actualModelId));
                }
                case 'google-ai-studio': {
                    const googleProvider = createGoogleGateway({
                        headers
                    });
                    return aigateway(googleProvider(actualModelId));
                }
                case 'google-vertex-ai': {
                    if(vertexProject && vertexRegion && publisher) {
                        const provider = createGoogleGenerativeAI({
                            apiKey,
                            baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-vertex-ai/v1/projects/${vertexProject}/locations/${vertexRegion}/publishers/${publisher}/`,
                            headers,
                        })
                        return provider(actualModelId);
                    }
                    return handleDefaultAiGatewayProvider({accountId, gatewayId, headers, isImage, modelId})
                }
                case 'openai': {
                    const openaiProvider = createOpenAI({
                        apiKey: 'no-key',
                        baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai`,
                        headers,
                        fetch: (input, init) => {
                            const hdrs = new Headers(init?.headers)
                            hdrs.delete('Authorization')
                            return fetch(input, { ...init, headers: hdrs })
                        },
                    })
                    if (isImage) {
                        return openaiProvider.imageModel(actualModelId)
                    }
                    return openaiResponsesModel
                        ? openaiProvider.responses(actualModelId)
                        : openaiProvider.chat(actualModelId)
                }
                default: {
                    return handleDefaultAiGatewayProvider({accountId, gatewayId, headers, isImage, modelId})
                }
            }
        }
        case AIProviderName.BEDROCK: {
            const { accessKeyId, secretAccessKey } = auth as BedrockProviderAuthConfig
            const { region } = config as BedrockProviderConfig
            const provider = createAmazonBedrock({
                region,
                accessKeyId,
                secretAccessKey,
            })
            if (isImage) {
                return provider.imageModel(modelId)
            }
            return provider(modelId)
        }
        case AIProviderName.CUSTOM: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const { apiKeyHeader, baseUrl, defaultHeaders } = config as OpenAICompatibleProviderConfig

            const customHeaders = defaultHeaders ?? {}

            const metadataHeaders: Record<string, string> = {
                'x-ap-project-id': projectId,
                'x-ap-platform-id': platformId,
                'x-ap-flow-id': flowId,
                'x-ap-run-id': runId,
            }

            const provider = createOpenAICompatible({
                name: 'openai-compatible',
                baseURL: baseUrl,
                headers: {
                    ...metadataHeaders,
                    ...customHeaders,
                    [apiKeyHeader]: apiKey,
                },
            })
            if (isImage) {
                return provider.imageModel(modelId)
            }
            return provider.chatModel(modelId)
        }
        case AIProviderName.MISTRAL: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            if (isImage) {
                throw new Error(`Provider ${AIProviderName.MISTRAL} does not support image models`)
            }
            const provider = createOpenAICompatible({
                name: 'mistral',
                baseURL: 'https://api.mistral.ai/v1',
                apiKey,
            })
            return provider.chatModel(modelId)
        }
        case AIProviderName.INTELLISPER:
        case AIProviderName.OPENROUTER: {
            const { apiKey } = auth as BaseAIProviderAuthConfig
            const openRouterProvider = createOpenRouter({ apiKey })
            return openRouterProvider.chat(modelId) as LanguageModel
        }
        default:
            throw new Error(`Provider ${provider} is not supported`)
    }
}



export const anthropicSearchTool = anthropic.tools.webSearch_20250305;
export const openaiSearchTool = openai.tools.webSearchPreview;
export const googleSearchTool = google.tools.googleSearch;

const EMBEDDING_DIMENSIONS = 768

const DEFAULT_EMBEDDING_MODELS: Partial<Record<AIProviderName, string>> = {
    [AIProviderName.OPENAI]: 'text-embedding-3-small',
    [AIProviderName.GOOGLE]: 'text-embedding-004',
    [AIProviderName.AZURE]: 'text-embedding-3-small',
    [AIProviderName.INTELLISPER]: 'text-embedding-3-small',
    [AIProviderName.OPENROUTER]: 'openai/text-embedding-3-small',
}

const OPENAI_EMBEDDING_PROVIDER_OPTIONS = {
    openai: { dimensions: EMBEDDING_DIMENSIONS },
}

type CreateEmbeddingModelParams = {
    provider: AIProviderName
    engineToken: string
    apiUrl: string
    /**
     * AI Gateway. When supplied, embeddings are metered into the cost ledger. The RAG tool embeds in
     * BULK (every document chunk, every query), so this is a real line item that was invisible before.
     */
    usageMeter?: {
        stepName: string
        projectId: string
        runId: string
        emit: BlockUsageEmitter
    }
}

export async function createEmbeddingModel(params: CreateEmbeddingModelParams): Promise<CreateEmbeddingModelResult> {
    // Fetch the config ONCE — a second round-trip just to learn the platformId would add real latency
    // to the flow's critical path.
    const providerConfig = await fetchProviderConfig({
        provider: params.provider,
        engineToken: params.engineToken,
        apiUrl: params.apiUrl,
    })
    const result = await buildEmbeddingModel(params, providerConfig)

    if (params.usageMeter === undefined) {
        return result
    }
    return {
        ...result,
        model: meterBlockEmbeddingModel({
            model: result.model,
            provider: params.provider,
            modelId: result.embeddingModelId,
            keyMode: AiKeyMode.MANAGED,
            context: {
                platformId: providerConfig.platformId,
                projectId: params.usageMeter.projectId,
                runId: params.usageMeter.runId,
                stepName: params.usageMeter.stepName,
            },
            emit: params.usageMeter.emit,
        }),
    }
}

async function buildEmbeddingModel(
    { provider }: CreateEmbeddingModelParams,
    providerConfig: Awaited<ReturnType<typeof fetchProviderConfig>>,
): Promise<CreateEmbeddingModelResult> {
    const { config, auth } = providerConfig

    const embeddingModelId = DEFAULT_EMBEDDING_MODELS[provider]
    if (!embeddingModelId) {
        throw new Error(`Provider ${provider} does not have a default embedding model configured`)
    }

    const { apiKey } = auth as BaseAIProviderAuthConfig

    switch (provider) {
        case AIProviderName.OPENAI: {
            const p = createOpenAI({ apiKey })
            return { model: p.embeddingModel(embeddingModelId), embeddingModelId, providerOptions: OPENAI_EMBEDDING_PROVIDER_OPTIONS }
        }
        case AIProviderName.GOOGLE: {
            const p = createGoogleGenerativeAI({ apiKey })
            return { model: p.textEmbeddingModel(embeddingModelId), embeddingModelId, providerOptions: {} }
        }
        case AIProviderName.AZURE: {
            const { resourceName, apiVersion } = config as AzureProviderConfig
            const p = createAzure({ resourceName, apiKey, apiVersion })
            return { model: p.embeddingModel(embeddingModelId), embeddingModelId, providerOptions: OPENAI_EMBEDDING_PROVIDER_OPTIONS }
        }
        case AIProviderName.INTELLISPER:
        case AIProviderName.OPENROUTER: {
            const openRouterProvider = createOpenRouter({ apiKey })
            return { model: openRouterProvider.textEmbeddingModel(embeddingModelId), embeddingModelId, providerOptions: OPENAI_EMBEDDING_PROVIDER_OPTIONS }
        }
        default:
            throw new Error(`Provider ${provider} does not support embedding models`)
    }
}

type CreateEmbeddingModelResult = {
    model: EmbeddingModel
    embeddingModelId: string
    providerOptions: ProviderOptions
}

const handleDefaultAiGatewayProvider = ({accountId, gatewayId, headers, isImage, modelId}: {
    accountId: string;
    gatewayId: string;
    headers: Record<string, string>;
    isImage?: boolean;
    modelId: string;
})=>{
    const provider = createOpenAICompatible({
        name: 'cloudflare',
        baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`,
        headers,
    })
    if (isImage) {
        return provider.imageModel(modelId)
    }
    return provider.chatModel(modelId)
}
