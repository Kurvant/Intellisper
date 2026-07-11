import { BlockMetadata, BlockMetadataModel } from '@intelblocks/blocks-framework'
import {
    IntellisperError,
    AddBlockRequestBody,
    EngineResponse,
    EngineResponseStatus,
    ErrorCode,
    ExecuteExtractBlockMetadata,
    FileCompression,
    FileId,
    FileType,
    isNil,
    PackageType,
    BlockPackage,
    BlockType,
    PlatformId,
    ProjectId,
    WorkerJobType,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileService } from '../file/file.service'
import { userInteractionWatcher } from '../workers/user-interaction-watcher'
import { blockMetadataService } from './metadata/piece-metadata-service'

export const blockInstallService = (log: FastifyBaseLogger) => ({
    async installBlock(
        platformId: string,
        params: AddBlockRequestBody,
    ): Promise<BlockMetadataModel> {
        try {
            const blockPackage = await saveBlockPackage(platformId, params, log)
            const blockInformation = await extractBlockInformation({
                ...blockPackage,
                platformId,
            }, log)
            const archiveId = blockPackage.packageType === PackageType.ARCHIVE ? blockPackage.archiveId : undefined
            const savedBlock = await blockMetadataService(log).create({
                blockMetadata: {
                    ...blockInformation,
                    minimumSupportedRelease:
                        blockInformation.minimumSupportedRelease ?? '0.0.0',
                    maximumSupportedRelease:
                        blockInformation.maximumSupportedRelease ?? '999.999.999',
                    name: blockInformation.name,
                    version: blockInformation.version,
                    i18n: blockInformation.i18n,
                },
                packageType: params.packageType,
                platformId,
                blockType: BlockType.CUSTOM,
                archiveId,
            })
            return savedBlock
        }
        catch (error) {
            log.error({ err: error }, '[pieceInstallService#add] Failed to add piece')

            if (error instanceof IntellisperError && error.error.code === ErrorCode.VALIDATION) {
                throw error
            }
            throw new IntellisperError({
                code: ErrorCode.ENGINE_OPERATION_FAILURE,
                params: {
                    message: JSON.stringify(error),
                },
            })
        }
    },
})


async function saveBlockPackage(platformId: string | undefined, params: AddBlockRequestBody, log: FastifyBaseLogger): Promise<BlockPackage> {

    switch (params.packageType) {
        case PackageType.ARCHIVE: {
            const archiveId = await saveArchive({
                projectId: undefined,
                platformId,
                archive: params.blockArchive.data as Buffer,
            }, log)
            return {
                ...params,
                blockType: BlockType.CUSTOM,
                archiveId,
                platformId: platformId!,
                packageType: params.packageType,
            }
        }

        case PackageType.REGISTRY: {
            return {
                ...params,
                blockType: BlockType.CUSTOM,
                platformId: platformId!,
            }
        }
    }
}

const extractBlockInformation = async (request: ExecuteExtractBlockMetadata, log: FastifyBaseLogger): Promise<BlockMetadata> => {
    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<BlockMetadata>>({
        jobType: WorkerJobType.EXECUTE_EXTRACT_BLOCK_INFORMATION,
        platformId: request.platformId,
        block: request,
        projectId: undefined,
    }, log)

    if (engineResponse.status !== EngineResponseStatus.OK) {
        throw new Error(engineResponse.error)
    }
    return engineResponse.response
}

const saveArchive = async (
    params: GetBlockArchivePackageParams,
    log: FastifyBaseLogger,
): Promise<FileId> => {
    const { projectId, platformId, archive } = params

    const archiveFile = await fileService(log).save({
        projectId: isNil(platformId) ? projectId : undefined,
        platformId,
        data: archive,
        size: archive.length,
        type: FileType.PACKAGE_ARCHIVE,
        compression: FileCompression.NONE,
    })

    return archiveFile.id
}

type GetBlockArchivePackageParams = {
    archive: Buffer
    projectId?: ProjectId
    platformId?: PlatformId
}

