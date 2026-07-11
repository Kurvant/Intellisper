// Clean-room implementation — alerts admin API (`/v1/alerts`, capability spec A.2). Manage a
// workspace's failure/threshold alert recipients. Every route is project-scoped: the caller
// must be a member of the workspace the alert belongs to (cross-project access is rejected
// 403 by the project security guard), with read/write gated by the READ_ALERT/WRITE_ALERT
// permissions.
import {
    Alert,
    CreateAlertParams,
    ListAlertsParams,
    Permission,
    PrincipalType,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { AlertEntity } from './alerts-entity'
import { alertsService } from './alerts-service'

const DEFAULT_LIST_LIMIT = 50

export const alertsModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(alertsController, { prefix: '/v1/alerts' })
}

const alertsController: FastifyPluginAsyncZod = async (app) => {

    // List a workspace's alert recipients. projectId comes from the query.
    app.get('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_ALERT, {
                type: ProjectResourceType.QUERY,
            }),
        },
        schema: {
            querystring: ListAlertsParams,
        },
    }, async (request): Promise<SeekPage<Alert>> => {
        return alertsService(request.log).list({
            projectId: request.query.projectId,
            cursor: request.query.cursor,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Register an alert recipient. projectId comes from the body.
    app.post('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_ALERT, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            body: CreateAlertParams,
        },
    }, async (request): Promise<Alert> => {
        return alertsService(request.log).create({
            projectId: request.body.projectId,
            channel: request.body.channel,
            receiver: request.body.receiver,
        })
    })

    // Remove an alert recipient. The project is resolved from the alert row (:id).
    app.delete('/:id', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_ALERT, {
                type: ProjectResourceType.TABLE,
                tableName: AlertEntity,
            }),
        },
        schema: {
            params: z.object({ id: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        await alertsService(request.log).delete({ id: request.params.id })
        return reply.status(StatusCodes.OK).send()
    })
}
