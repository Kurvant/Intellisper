import { BlockMetadataModel, BlockMetadataModelSummary } from '@intelblocks/blocks-framework'
import {
    ALL_PRINCIPAL_TYPES,
    BlockCategory,
    BlockOptionRequest,
    EngineResponse,
    ErrorCode,
    GetBlockRequestParams,
    GetBlockRequestQuery,
    GetBlockRequestWithScopeParams,
    IntellisperError,
    isNil,
    ListBlocksRequestQuery,
    LocalesEnum,
    Principal,
    PrincipalType,
    RegistryBlocksRequestQuery,
    SampleDataFileType,
    WorkerJobType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { flowService } from '../../flows/flow/flow.service'
import { sampleDataService } from '../../flows/step-run/sample-data.service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { blockSyncService } from '../piece-sync-service'
import { blockMetadataService, getBlockPackageWithoutArchive } from './piece-metadata-service'

export const blockModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(baseBlocksController, { prefix: '/v1/blocks' })
}

const baseBlocksController: FastifyPluginAsyncZod = async (app) => {

    app.get(
        '/categories',
        ListCategoriesRequest,
        async (): Promise<BlockCategory[]> => {
            return Object.values(BlockCategory)
        },
    )

    app.get('/', ListBlocksRequest, async (req): Promise<BlockMetadataModelSummary[]> => {
        const query = req.query

        const oldSyncCall = !isNil(query.release)
        if (oldSyncCall) {
            throw new IntellisperError({
                code: ErrorCode.BLOCK_SYNC_NOT_SUPPORTED,
                params: {
                    message: 'This endpoint is deprecated. Please use it without release parameter.',
                    release: query.release ?? '',
                },
            })
        }
        const includeTags = query.includeTags ?? false
        const platformId = getPlatformId(req.principal)
        const projectId = req.query.projectId
        const blockMetadataSummary = await blockMetadataService(req.log).list({
            includeHidden: query.includeHidden ?? false,
            projectId,
            platformId,
            includeTags,
            categories: query.categories,
            searchQuery: query.searchQuery,
            sortBy: query.sortBy,
            orderBy: query.orderBy,
            suggestionType: query.suggestionType,
            locale: query.locale as LocalesEnum | undefined,
        })
        return blockMetadataSummary.map((block) => {
            return {
                ...block,
                i18n: undefined,
            }
        })
    })

    app.get(
        '/:scope/:name',
        GetBlockParamsWithScopeRequest,
        async (req) => {
            const { name, scope } = req.params
            const { version } = req.query

            const decodeScope = decodeURIComponent(scope)
            const decodedName = decodeURIComponent(name)
            const platformId = getPlatformId(req.principal)
            return blockMetadataService(req.log).getOrThrow({
                platformId,
                name: `${decodeScope}/${decodedName}`,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
        },
    )

    app.get(
        '/:name',
        GetBlockParamsRequest,
        async (req): Promise<BlockMetadataModel> => {
            const { name } = req.params
            const { version } = req.query
            const decodedName = decodeURIComponent(name)
            const platformId = getPlatformId(req.principal)
            return blockMetadataService(req.log).getOrThrow({
                platformId,
                name: decodedName,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
        },
    )

    app.get('/registry', RegistryBlocksRequest, async (req) => {
        const blocks = await blockMetadataService(req.log).registry({
            release: req.query.release,
            platformId: getPlatformId(req.principal),
        })
        return blocks
    })

    app.post('/sync', SyncBlocksRequest, async (req) => blockSyncService(req.log).sync({ publishCacheRefresh: true }))

    app.post(
        '/options',
        OptionsBlockRequest,
        async (req) => {
            const projectId = req.projectId
            const platform = req.principal.platform
            const flow = await flowService(req.log).getOnePopulatedOrThrow({
                projectId,
                id: req.body.flowId,
                versionId: req.body.flowVersionId,
            })
            const sampleData = await sampleDataService(req.log).getSampleDataForFlow(projectId, flow.version, SampleDataFileType.OUTPUT)
            const { response } = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<unknown>>({
                jobType: WorkerJobType.EXECUTE_PROPERTY,
                platformId: platform.id,
                projectId,
                flowVersion: flow.version,
                propertyName: req.body.propertyName,
                actionOrTriggerName: req.body.actionOrTriggerName,
                input: req.body.input,
                sampleData,
                searchValue: req.body.searchValue,
                block: await getBlockPackageWithoutArchive(req.log, platform.id, req.body),
            }, req.log)
            return response
        },
    )

}

function getPlatformId(principal: Principal): string | undefined {
    return principal.type === PrincipalType.WORKER || principal.type === PrincipalType.UNKNOWN || principal.type === PrincipalType.ONBOARDING ? undefined : principal.platform?.id
}

const RegistryBlocksRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        querystring: RegistryBlocksRequestQuery,
    },
}

const ListBlocksRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        querystring: ListBlocksRequestQuery,

    },

}
const GetBlockParamsRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: GetBlockRequestParams,
        querystring: GetBlockRequestQuery,
    },
}

const GetBlockParamsWithScopeRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: GetBlockRequestWithScopeParams,
        querystring: GetBlockRequestQuery,
    },
}

const ListCategoriesRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        querystring: ListBlocksRequestQuery,
    },
}

const OptionsBlockRequest = {
    schema: {
        body: BlockOptionRequest,
    },
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.BODY,
        }),
    },
}

const SyncBlocksRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER]),
    },
}