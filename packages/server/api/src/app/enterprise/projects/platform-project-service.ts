// Clean-room implementation — multi-workspace (platform project) management and the
// two-stage workspace removal (capability spec C.1 / I.5).
//
// Removal is observable in two stages: markForDeletion makes the workspace immediately
// unusable-but-restorable (a soft delete), and schedules an idempotent background job
// that eventually and completely removes the workspace and its dependent data. The job
// is keyed deterministically per project so repeated scheduling is a no-op and the
// removal is safely repeatable.
import { ibDayjs } from '@intelblocks/server-utils'
import { ibId, FlowStatus, isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { flowRepo } from '../../flows/flow/flow.repo'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { projectRepo } from '../../project/project-service'

export const platformProjectService = (log: FastifyBaseLogger) => ({

    // Stage 1 of workspace removal: soft-delete the project (immediately unusable, still
    // restorable) and schedule the idempotent hard-delete job. The set of currently
    // enabled flows is captured so the job can tear their live triggers down before the
    // data is removed. Scheduling is keyed per project, so calling this more than once
    // for the same project does not create duplicate jobs.
    async markForDeletion({ id, platformId }: { id: string, platformId: string }): Promise<void> {
        const project = await projectRepo().findOneBy({ id, platformId })
        if (isNil(project)) {
            return
        }

        const enabledFlowIds = (await flowRepo().find({
            select: ['id'],
            where: { projectId: id, status: FlowStatus.ENABLED },
        })).map((flow) => flow.id)

        await projectRepo().softDelete({ id, platformId })

        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.HARD_DELETE_PROJECT,
                data: { projectId: id, platformId, preDeletedFlowIds: enabledFlowIds },
                jobId: `hard-delete-project-${id}`,
            },
            schedule: { type: 'one-time', date: ibDayjs() },
            customConfig: { attempts: 25, backoff: { type: 'fixed', delay: 60000 } },
        })
    },

    // Remove a user's personal (individual) workspace when the user is removed from the
    // platform. Soft-deletes and schedules the same idempotent hard-delete path.
    async deletePersonalProjectForUser({ userId, platformId }: { userId: string, platformId: string }): Promise<void> {
        const projects = await projectRepo().findBy({ ownerId: userId, platformId, deleted: IsNull() })
        for (const project of projects) {
            await this.markForDeletion({ id: project.id, platformId })
        }
    },
})

// Exposed so callers that need a stable placeholder id can share the generator.
export const generatePlatformProjectId = (): string => ibId()
