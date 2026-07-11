// Clean-room implementation — outbound platform event webhooks (`/v1/platform-webhooks`,
// capability spec "outbound event delivery"). An organization registers webhook DESTINATIONS —
// each a URL subscribed to a set of application events — and the platform delivers a signed
// payload to those URLs whenever a subscribed event fires. This is the management surface
// (create / list / update / delete / test) over the event-destination store; the actual fan-out
// is driven by the event-destination service's listener on the application-events seam.
//
// Registering this module ALSO wires that delivery: `eventDestinationService.setup()` attaches the
// listener so every emitted application event is matched against the registered destinations and
// enqueued for delivery by the worker. Delivery is therefore active exactly in the editions that
// register this module (CLOUD / ENTERPRISE).
//
// Every operation is ORGANIZATION-ADMINISTRATOR only and strictly scoped to the caller's own
// organization; the whole feature is entitlement-gated on the event-streaming plan flag.
import {
    CreatePlatformEventDestinationRequestBody,
    EventDestination,
    ListPlatformEventDestinationsRequestBody,
    PrincipalType,
    SeekPage,
    TestPlatformEventDestinationRequestBody,
    UpdatePlatformEventDestinationRequestBody,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { eventDestinationService } from '../../event-destinations/event-destinations.service'
import { platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'

const DEFAULT_LIST_LIMIT = 20

export const platformWebhooksModule: FastifyPluginAsyncZod = async (app) => {
    // Wire outbound delivery: attach the event-destination listener to the application-events seam
    // so emitted events fan out to the registered webhook URLs (idempotent per process).
    eventDestinationService(app.log).setup()
    // Entitlement gate: outbound event webhooks are an event-streaming plan feature.
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.eventStreamingEnabled))
    await app.register(platformWebhooksController, { prefix: '/v1/platform-webhooks' })
}

// Organization-administrator only; a service principal acts for the organization.
const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) } }

const platformWebhooksController: FastifyPluginAsyncZod = async (app) => {

    // Register a webhook destination: a URL subscribed to a set of application events.
    app.post('/', {
        ...adminOnly,
        schema: { body: CreatePlatformEventDestinationRequestBody },
    }, async (request, reply): Promise<EventDestination> => {
        const destination = await eventDestinationService(request.log).create(
            request.body,
            request.principal.platform.id,
        )
        return reply.status(StatusCodes.CREATED).send(destination)
    })

    // List the organization's webhook destinations, cursor paginated.
    app.get('/', {
        ...adminOnly,
        schema: { querystring: ListPlatformEventDestinationsRequestBody },
    }, async (request): Promise<SeekPage<EventDestination>> => {
        return eventDestinationService(request.log).list({
            platformId: request.principal.platform.id,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Update a webhook destination's URL / subscribed events.
    app.post('/:id', {
        ...adminOnly,
        schema: {
            params: z.object({ id: z.string() }),
            body: UpdatePlatformEventDestinationRequestBody,
        },
    }, async (request): Promise<EventDestination> => {
        return eventDestinationService(request.log).update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            request: request.body,
        })
    })

    // Delete a webhook destination.
    app.delete('/:id', {
        ...adminOnly,
        schema: { params: z.object({ id: z.string() }) },
    }, async (request, reply): Promise<void> => {
        await eventDestinationService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // Send a mock event to a URL so the operator can confirm the endpoint receives deliveries.
    app.post('/test', {
        ...adminOnly,
        schema: { body: TestPlatformEventDestinationRequestBody },
    }, async (request, reply): Promise<{ success: boolean }> => {
        await eventDestinationService(request.log).test({
            platformId: request.principal.platform.id,
            url: request.body.url,
            event: request.body.event,
        })
        return reply.status(StatusCodes.OK).send({ success: true })
    })
}
