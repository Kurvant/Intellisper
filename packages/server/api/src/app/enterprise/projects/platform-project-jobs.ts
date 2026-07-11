// Clean-room implementation — async workspace hard-delete job (capability spec I.5).
//
// Stage 2 of workspace removal: idempotently and completely remove a soft-deleted
// project and its dependent data. The handler first tears down any live triggers of the
// flows that were enabled at deletion time (best-effort — a stale trigger must not block
// data removal), then hard-deletes the project row. The project's child data (flows,
// versions, runs, connections' scoping, tables, etc.) is removed by the database's own
// cascade on the project foreign keys, so a single row delete completes the cascade.
//
// The handler is safely repeatable: if the project row is already gone it completes
// without error, so a retried or duplicated job is a no-op.
import { isNil, tryCatch } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { projectRepo } from '../../project/project-service'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'

export const platformProjectBackgroundJobs = (log: FastifyBaseLogger) => ({

    async hardDeleteProjectHandler(data: SystemJobData<SystemJobName.HARD_DELETE_PROJECT>): Promise<void> {
        const { projectId, preDeletedFlowIds } = data

        // If the project is already fully gone, this is a repeated/late job — succeed.
        const project = await projectRepo().findOne({ where: { id: projectId }, withDeleted: true })
        if (isNil(project)) {
            return
        }

        // Tear down live triggers for the flows that were enabled at deletion time.
        // Best-effort: a failure here (e.g. a block that can no longer be resolved) must
        // not prevent the data from being removed, so each teardown is isolated.
        for (const flowId of preDeletedFlowIds ?? []) {
            const { error } = await tryCatch(() => triggerSourceService(log).disable({
                flowId,
                projectId,
                simulate: false,
                ignoreError: true,
            }))
            if (!isNil(error)) {
                log.warn({ err: error, flowId, projectId }, '[hardDeleteProjectHandler] trigger teardown failed; continuing with data removal')
            }
        }

        // Remove the project's own connections. App-connections are multi-project scoped
        // (the project reference is a nullable array with SET NULL on the project FK), so
        // they are not swept by the project row cascade and must be removed explicitly.
        await appConnectionService(log).deleteAllProjectConnections(projectId)

        // Hard-delete the project row; the remaining child data (flows, versions, runs,
        // tables, etc.) cascades via the project foreign keys.
        await projectRepo().delete({ id: projectId })
        log.info({ projectId }, '[hardDeleteProjectHandler] Project hard-deleted')
    },
})
