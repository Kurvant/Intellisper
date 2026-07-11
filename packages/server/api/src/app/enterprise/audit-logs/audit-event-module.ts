// Clean-room implementation — audit logging API (/v1/audit-events, capability spec K.1).
//
// Listing the organization's audit trail is restricted to the organization owner (a
// governance/compliance surface). Reading is NOT entitlement-gated — the spec keeps audit
// availability in every edition because it underpins compliance claims — so the module gates
// on ownership only, not a plan flag. Registering the module also wires the persistence writer
// onto the application-events seam, so events start being recorded.
import {
    ApplicationEvent,
    ListAuditEventsRequest,
    PrincipalType,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformMustBeOwnedByCurrentUser } from '../authentication/ee-authorization'
import { auditEventService } from './audit-event-service'

export const auditEventModule: FastifyPluginAsyncZod = async (app) => {
    // Wire the persistence writer onto the application-events seam (idempotent per process).
    auditEventService(app.log).setup()
    await app.register(auditEventController, { prefix: '/v1/audit-events' })
}

const auditEventController: FastifyPluginAsyncZod = async (app) => {

    // List the organization's audit events (owner-only), newest first, filterable and
    // paginated. Strictly scoped to the caller's platform.
    app.get('/', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER]) },
        schema: { querystring: ListAuditEventsRequest },
    }, async (request, reply): Promise<SeekPage<ApplicationEvent>> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        return auditEventService(request.log).list({
            platformId: request.principal.platform.id,
            request: request.query,
        })
    })
}
