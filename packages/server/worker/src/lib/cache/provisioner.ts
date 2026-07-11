import { fileSystemUtils } from '@intelblocks/server-utils'
import { BlockPackage, tryCatch, unique, WorkerToApiContract } from '@intelblocks/shared'
import { trace } from '@opentelemetry/api'
import { Logger } from 'pino'
import { getGlobalCacheCommonPath, getGlobalCachePathLatestVersion, getGlobalCodeCachePath } from './cache-paths'
import { CodeArtifact, codeBuilder } from './code/code-builder'
import { engineInstaller } from './engine/engine-installer'
import { blockInstaller } from './pieces/piece-installer'

const tracer = trace.getTracer('provisioner')

export const provisioner = (log: Logger, apiClient: WorkerToApiContract) => ({
    async provision({
        blocks,
        codeSteps,
    }: ProvisionParams): Promise<void> {
        await tracer.startActiveSpan('provisioner.provision', async (span) => {
            try {
                const cachePathLatestVersion = getGlobalCachePathLatestVersion()
                const codeCachePath = getGlobalCodeCachePath()
                const commonPath = getGlobalCacheCommonPath()

                await fileSystemUtils.threadSafeMkdir(cachePathLatestVersion)

                await tracer.startActiveSpan('provisioner.installCode', async (codeSpan) => {
                    try {
                        codeSpan.setAttribute('code.path', codeCachePath)
                        await fileSystemUtils.threadSafeMkdir(codeCachePath)
                        for (const artifact of codeSteps) {
                            await codeBuilder(log).processCodeStep({
                                artifact,
                                codesFolderPath: codeCachePath,
                            })
                        }
                        log.info({ path: codeCachePath }, 'Installed code in sandbox')
                    }
                    finally {
                        codeSpan.end()
                    }
                })

                await tracer.startActiveSpan('provisioner.installEngine', async (engineSpan) => {
                    try {
                        engineSpan.setAttribute('engine.path', commonPath)
                        const { cacheHit } = await engineInstaller(log).install({
                            path: commonPath,
                        })
                        engineSpan.setAttribute('engine.cacheHit', cacheHit)
                        log.info({ path: commonPath, cacheHit }, 'Installed engine in sandbox')
                    }
                    finally {
                        engineSpan.end()
                    }
                })

                const uniqueBlocks = unique(blocks)
                if (uniqueBlocks.length > 0) {
                    await tracer.startActiveSpan('provisioner.installPieces', async (blocksSpan) => {
                        try {
                            blocksSpan.setAttribute('pieces.count', uniqueBlocks.length)
                            await blockInstaller(log, apiClient).install({
                                blocks: uniqueBlocks,
                                includeFilters: true,
                            })
                            void tryCatch(() => apiClient.markBlockAsUsed({ blocks: uniqueBlocks }))
                            log.info({
                                blocks: uniqueBlocks.map(p => `${p.blockName}@${p.blockVersion}`),
                                path: commonPath,
                            }, 'Installed pieces in sandbox')
                        }
                        finally {
                            blocksSpan.end()
                        }
                    })
                }
                log.info('Sandbox installation complete')
            }
            finally {
                span.end()
            }
        })
    },
})

type ProvisionParams = {
    blocks: BlockPackage[]
    codeSteps: CodeArtifact[]
}
