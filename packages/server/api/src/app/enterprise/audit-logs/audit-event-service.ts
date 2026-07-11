// Clean-room implementation — audit logging (capability spec K.1). An append-only, tamper-
// evident record of security- and governance-relevant events (authentication, membership and
// role changes, connection and credential changes, releases, key/secret-store events),
// attributed to organization / workspace / actor and queryable with filtering + pagination.
//
// The writer is registered as a listener on the shared application-events seam
// (applicationEvents.registerListeners), so every event emitted via sendUserEvent /
// sendWorkerEvent is persisted. Persistence is best-effort and MUST NOT throw back into the
// triggering operation (a logging failure never breaks the action it records).
import {
    ibId,
    ApplicationEvent,
    ApplicationEventName,
    isNil,
    ListAuditEventsRequest,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { And, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { applicationEvents } from '../../helper/application-events'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { AuditEventEntity } from './audit-event-entity'

const auditEventRepo = repoFactory(AuditEventEntity)

const DEFAULT_LIST_LIMIT = 20

export const auditEventService = (log: FastifyBaseLogger) => ({

    // Register the persistence writer on the application-events seam. Called once at module
    // registration; from then on every emitted event is appended to the audit log.
    setup(): void {
        applicationEvents(log).registerListeners(log, {
            userEvent: (listenerLog) => (event) => {
                void auditEventService(listenerLog).write(event)
            },
            workerEvent: (listenerLog) => (_projectId, event) => {
                void auditEventService(listenerLog).write(event)
            },
        })
    },

    // Append a single event. Best-effort: a persistence failure is logged and swallowed so it
    // never propagates back into the operation that emitted the event.
    async write(event: ApplicationEvent): Promise<void> {
        try {
            await auditEventRepo().save({
                ...event,
                id: event.id ?? ibId(),
            })
        }
        catch (error) {
            log.error({ err: error, action: event.action, platformId: event.platformId }, '[auditEventService#write] failed to persist audit event')
        }
    },

    // Query a platform's audit events (append-only, newest first) with optional filtering by
    // action, project, actor, and created-before/after, paginated. Strictly platform-scoped —
    // an event of another organization can never be returned.
    async list(params: ListParams): Promise<SeekPage<ApplicationEvent>> {
        const decodedCursor = paginationHelper.decodeCursor(params.request.cursor ?? null)
        const paginator = buildPaginator({
            entity: AuditEventEntity,
            query: {
                limit: params.request.limit ?? DEFAULT_LIST_LIMIT,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const queryBuilder = auditEventRepo()
            .createQueryBuilder('audit_event')
            .where({ platformId: params.platformId })

        const actions = normalizeArray(params.request.action)
        if (!isNil(actions) && actions.length > 0) {
            queryBuilder.andWhere({ action: In(actions as ApplicationEventName[]) })
        }

        const projectIds = normalizeArray(params.request.projectId)
        if (!isNil(projectIds) && projectIds.length > 0) {
            queryBuilder.andWhere({ projectId: In(projectIds) })
        }

        if (!isNil(params.request.userId)) {
            queryBuilder.andWhere({ userId: params.request.userId })
        }

        const createdConstraints = []
        if (!isNil(params.request.createdAfter)) {
            createdConstraints.push(MoreThanOrEqual(params.request.createdAfter))
        }
        if (!isNil(params.request.createdBefore)) {
            createdConstraints.push(LessThanOrEqual(params.request.createdBefore))
        }
        if (createdConstraints.length === 1) {
            queryBuilder.andWhere({ created: createdConstraints[0] })
        }
        else if (createdConstraints.length === 2) {
            queryBuilder.andWhere({ created: And(...createdConstraints) })
        }

        const { data, cursor } = await paginator.paginate(queryBuilder)
        return paginationHelper.createPage(data, cursor)
    },
})

function normalizeArray(value: string | string[] | undefined): string[] | undefined {
    if (isNil(value)) {
        return undefined
    }
    return Array.isArray(value) ? value : [value]
}

type ListParams = {
    platformId: string
    request: ListAuditEventsRequest
}
