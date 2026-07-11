// Clean-room implementation — failure/threshold alerting (capability spec A.2). Two halves:
//   (1) Recipient management — a per-workspace managed collection of receivers (channel +
//       normalized address); create/list/delete + an idempotent establishment `add`. Addresses
//       are lower-cased before storage/comparison; a duplicate is rejected as "already exists"
//       (which the establishment hook treats as a no-op); a personal workspace may register only
//       its owner's address. All workspace-scoped.
//   (2) Failure dispatch — `sendAlertOnRunFinish`, invoked from the run-completion hook when an
//       automation run fails in PRODUCTION with an identified failed step. Deduplicated to at
//       most ONE alert per automation version per rolling 24-hour window (a short-lived counter
//       keyed by the flow version, one-day expiry — only the first failure notifies). The
//       notification identifies the workspace/automation, the failed step (name, position,
//       error), a deep link to the failed run, and a timestamp, delivered via A.1 email to the
//       workspace's configured receivers (bounded by a maximum). Dispatch is paid-edition only
//       (the caller already gates on that) and never throws back into the run.
import { ibDayjsDuration } from '@intelblocks/server-utils'
import {
    IntellisperError,
    Alert,
    AlertChannel,
    ibId,
    Cursor,
    ErrorCode,
    FailedStep,
    flowStructureUtil,
    isNil,
    ProjectType,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { redisConnections } from '../../database/redis'
import { distributedStore } from '../../database/redis-connections'
import { flowVersionService } from '../../flows/flow-version/flow-version.service'
import { domainHelper } from '../../helper/domain-helper'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { emailService } from '../helper/email/email-service'
import { AlertEntity } from './alerts-entity'

const alertRepo = repoFactory(AlertEntity)

// Duplicate-suppression window: at most one alert per automation version per rolling 24 hours.
const ALERT_DEDUP_TTL_SECONDS = ibDayjsDuration(1, 'day').asSeconds()
// A sane maximum number of receivers a single failure notification fans out to.
const MAX_ALERT_RECEIVERS = 50

function dedupKey(flowVersionId: string): string {
    return `alert:issue:${flowVersionId}`
}

type IssueToAlert = {
    projectId: string
    flowVersionId: string
    flowId: string
    created: string
}

export const alertsService = (log: FastifyBaseLogger) => ({
    // Raise a failure alert for a run that failed in production with an identified failed step.
    // Deduplicated per automation version over a rolling 24h window (only the first failure in
    // the window notifies; later failures increment the counter and send nothing). Best-effort:
    // any failure here is logged and swallowed so it never aborts the run-completion path.
    async sendAlertOnRunFinish(params: {
        issueToAlert: IssueToAlert
        flowRunId: string
        failedStep: FailedStep | undefined
    }): Promise<void> {
        const { issueToAlert, flowRunId, failedStep } = params
        try {
            // Deduplication: only the FIRST failure in the window claims the key (putIfAbsent
            // returns true once); subsequent failures increment the counter but do not notify.
            const isFirstInWindow = await distributedStore.putIfAbsent(dedupKey(issueToAlert.flowVersionId), 1, ALERT_DEDUP_TTL_SECONDS)
            if (!isFirstInWindow) {
                await incrementDedupCounter(issueToAlert.flowVersionId)
                return
            }

            const receivers = await this.listReceiverAddresses({ projectId: issueToAlert.projectId, channel: AlertChannel.EMAIL })
            if (receivers.length === 0) {
                return
            }

            const platformId = await projectService(log).getPlatformId(issueToAlert.projectId)
            const flowVersion = await flowVersionService(log).getOne(issueToAlert.flowVersionId)
            const flowName = flowVersion?.displayName ?? 'Automation'
            const stepNumber = !isNil(flowVersion) && !isNil(failedStep)
                ? flowStructureUtil.getStepNumber(flowVersion.trigger, failedStep.name)
                : 0
            const issueUrl = await domainHelper.getPublicUrl({
                path: `projects/${issueToAlert.projectId}/runs/${flowRunId}`,
            })

            await emailService(log).sendIssueCreatedNotification({
                platformId,
                emails: receivers,
                flowName,
                issueUrl,
                stepName: failedStep?.displayName ?? failedStep?.name ?? 'Unknown step',
                stepNumber,
                errorMessage: failedStep?.message ?? 'The step failed without a message.',
                timestamp: issueToAlert.created,
            })
        }
        catch (error) {
            log.warn({ error, flowRunId }, '[alertsService] failed to dispatch failure alert; continuing')
        }
    },

    // The workspace's email receiver addresses (bounded), for a failure notification.
    async listReceiverAddresses({ projectId, channel }: { projectId: string, channel: AlertChannel }): Promise<string[]> {
        const receivers = await alertRepo().find({
            where: { projectId, channel },
            take: MAX_ALERT_RECEIVERS,
        })
        return receivers.map((receiver) => receiver.receiver)
    },

    // Register an alert recipient for a project (establishment hook path). Idempotent per
    // (project, channel, receiver): re-adding an existing recipient is a no-op rather than a
    // unique-index violation. The receiver is normalized to lower case for stable matching.
    async add({ channel, projectId, receiver }: AddParams): Promise<void> {
        const normalizedReceiver = receiver.toLowerCase()
        const existing = await alertRepo().findOneBy({ projectId, channel, receiver: normalizedReceiver })
        if (existing) {
            return
        }
        await alertRepo().save({
            id: ibId(),
            projectId,
            channel,
            receiver: normalizedReceiver,
        })
    },

    // List a project's alert recipients, paginated.
    async list({ projectId, cursor, limit }: ListParams): Promise<SeekPage<Alert>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor ?? null)
        const paginator = buildPaginator({
            entity: AlertEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = alertRepo()
            .createQueryBuilder('alert')
            .where('alert."projectId" = :projectId', { projectId })
        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        return paginationHelper.createPage(data, nextCursor)
    },

    // Create an alert recipient via the API. The receiver is normalized to lower case; a
    // duplicate (same project + channel + receiver, case-insensitively) is rejected as a
    // conflict rather than silently succeeding or hitting the unique index. On a *personal*
    // workspace the recipient MUST be the workspace owner's own email — a personal workspace
    // is a single user's space, so it cannot be used to notify arbitrary third parties.
    async create({ projectId, channel, receiver }: AddParams): Promise<Alert> {
        const normalizedReceiver = receiver.toLowerCase()

        const project = await projectService(log).getOneOrThrow(projectId)
        if (project.type === ProjectType.PERSONAL) {
            const owner = await userService(log).getMetaInformation({ id: project.ownerId })
            const ownerEmail = owner.email.toLowerCase()
            if (normalizedReceiver !== ownerEmail) {
                throw new IntellisperError({
                    code: ErrorCode.EXISTING_ALERT_CHANNEL,
                    params: { message: 'A personal project alert receiver must be the project owner.' },
                })
            }
        }

        const existing = await alertRepo().findOneBy({ projectId, channel, receiver: normalizedReceiver })
        if (existing) {
            throw new IntellisperError({
                code: ErrorCode.EXISTING_ALERT_CHANNEL,
                params: { message: 'An alert with this receiver already exists for this project.' },
            })
        }

        return alertRepo().save({
            id: ibId(),
            projectId,
            channel,
            receiver: normalizedReceiver,
        })
    },

    // Resolve an alert by id (not tenant-scoped here — the caller authorizes access to the
    // alert's project via the security guard on the route).
    async getOneOrThrow(id: string): Promise<Alert> {
        const alert = await alertRepo().findOneBy({ id })
        if (isNil(alert)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'alert', entityId: id },
            })
        }
        return alert
    },

    async delete({ id }: { id: string }): Promise<void> {
        await alertRepo().delete({ id })
    },
})

// Atomically increment the per-version failure counter for the current window (the count that
// accumulates during a sustained outage after the first-failure alert has already been sent).
// The key already carries the window TTL from the initial putIfAbsent, so INCR preserves it.
async function incrementDedupCounter(flowVersionId: string): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.incr(dedupKey(flowVersionId))
}

type AddParams = {
    channel: AlertChannel
    projectId: string
    receiver: string
}

type ListParams = {
    projectId: string
    cursor: Cursor | null | undefined
    limit: number
}
