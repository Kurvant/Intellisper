import replyFrom from '@fastify/reply-from'
import swagger from '@fastify/swagger'
import { BlockMetadata } from '@intelblocks/blocks-framework'
import { AddAllowedEmbedOriginsRequestBody, AppConnectionWithoutSensitiveData, ApplicationEventName, ConnectionDeletedEvent, ConnectionUpsertedEvent, Flow, FlowActivatedEvent, FlowCreatedEvent, FlowDeactivatedEvent, FlowDeletedEvent, FlowPublishedEvent, FlowRun, FlowRunFinishedEvent, FlowRunRetriedEvent, FlowRunStartedEvent, FlowUpdatedEvent, Folder, FolderCreatedEvent, FolderDeletedEvent, FolderUpdatedEvent, GitRepoWithoutSensitiveData, IbEdition, IbEnvironment, isNil, ProjectMember, ProjectRelease, ProjectReleaseEvent, ProjectRoleEvent, ProjectWithLimits, SigningKeyEvent, SignUpEvent, Template, UserEmailVerifiedEvent, UserInvitation, UserPasswordResetEvent, UserSignedInEvent, UserWithMetaInformation } from '@intelblocks/shared'
import { createAdapter } from '@socket.io/redis-adapter'
import { FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify'
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod'
import Mustache from 'mustache'
import { globalRegistry } from 'zod/v4/core'
import { agentsModule } from './agents/agents-module'
import { aiProviderService } from './ai/ai-provider-service'
import { aiProviderModule } from './ai/ai-provider.module'
import { aiGatewayAdminModule } from './ai-gateway/ai-gateway-admin.module'
import { aiGatewayModule } from './ai-gateway/ai-gateway.module'
import { aiUsageSink } from './ai-gateway/ai-usage-sink'
import { platformAnalyticsModule } from './analytics/platform-analytics.module'
import { setPlatformOAuthService } from './app-connection/app-connection-service/oauth2'
import { appConnectionModule } from './app-connection/app-connection.module'
import { platformAppConnectionModule } from './app-connection/platform-app-connection.module'
import { authenticationModule } from './authentication/authentication.module'
import { registerBrowserAgentAutomationJobs } from './browser-agent/automation/browser-agent-automation.jobs'
import { registerBrowserAgentPresenceGateway } from './browser-agent/automation/presence.gateway'
import { browserAgentModule } from './browser-agent/browser-agent.module'
import { browserAgentActivityAdminModule } from './browser-agent/runtime/browser-agent-activity-admin.module'
import { canaryRoutingMiddleware } from './core/canary/canary-routing.middleware'
import { collaborativeModule } from './core/collaborative/collaborative.module'
import { rateLimitModule } from './core/security/rate-limit'
import { authenticationMiddleware } from './core/security/v2/authn/authentication-middleware'
import { authorizationMiddleware } from './core/security/v2/authz/authorization-middleware'
import { distributedLock, redisConnections } from './database/redis-connections'
import { alertsModule } from './enterprise/alerts/alerts-module'
import { apiKeyModule } from './enterprise/api-keys/api-key-module'
import { platformOAuth2Service } from './enterprise/app-connections/platform-oauth2-service'
import { appCredentialModule } from './enterprise/app-credentials/app-credentials.module'
// AppSumo dropped (clean-room cleanup): no replacement; feature removed entirely.
import { auditEventModule } from './enterprise/audit-logs/audit-event-module'
import { enterpriseLocalAuthnModule } from './enterprise/authentication/enterprise-local-authn/enterprise-local-authn-module'
import { federatedAuthModule } from './enterprise/authentication/federated-authn/federated-authn-module'
import { otpModule } from './enterprise/authentication/otp/otp-module'
import { rbacMiddleware } from './enterprise/authentication/project-role/rbac-middleware'
import { authnSsoSamlModule } from './enterprise/authentication/saml-authn/authn-sso-saml-module'
import { chatModule } from './enterprise/chat/chat.module'
import { chatMetricsPrune } from './enterprise/chat/telemetry/chat-metrics-prune'
import { connectionKeyModule } from './enterprise/connection-keys/connection-key.module'
import { embedSubdomainModule } from './enterprise/embed-subdomain/embed-subdomain.module'
import { enterpriseFlagsHooks } from './enterprise/flags/enterprise-flags.hooks'
import { flowRunTrackingService } from './enterprise/flow-run-tracking/flow-run-tracking-service'
import { globalConnectionModule } from './enterprise/global-connections/global-connection-module'
import { licenseKeysModule } from './enterprise/license-keys/license-keys-module'
import { managedAuthnModule } from './enterprise/managed-authn/managed-authn-module'
import { oauthAppModule } from './enterprise/oauth-apps/oauth-app.module'
import { platformBlockModule } from './enterprise/pieces/platform-piece-module'
import { adminPlatformModule } from './enterprise/platform/admin/admin-platform.controller'
import { chatAnalyticsModule } from './enterprise/platform/admin/chat-analytics/chat-analytics.controller'
import { adminPlatformTemplatesCloudModule } from './enterprise/platform/admin/templates/admin-platform-templates-cloud.module'
import { platformAiCreditsService } from './enterprise/platform/platform-plan/platform-ai-credits.service'
import { platformPlanModule } from './enterprise/platform/platform-plan/platform-plan.module'
import { platformWebhooksModule } from './enterprise/platform-webhooks/platform-webhooks.module'
import { projectEnterpriseHooks } from './enterprise/projects/ee-project-hooks'
import { platformProjectBackgroundJobs } from './enterprise/projects/platform-project-jobs'
import { platformProjectModule } from './enterprise/projects/platform-project-module'
import { projectMemberModule } from './enterprise/projects/project-members/project-member.module'
import { gitRepoModule } from './enterprise/projects/project-release/git-sync/git-sync.module'
import { projectReleaseModule } from './enterprise/projects/project-release/project-release.module'
import { projectRoleModule } from './enterprise/projects/project-role/project-role.module'
import { scimModule } from './enterprise/scim/scim-module'
import { secretManagersModule } from './enterprise/secret-managers/secret-managers.module'
import { signingKeyModule } from './enterprise/signing-key/signing-key-module'
import { userModule } from './enterprise/users/user.module'
import { fileModule } from './file/file.module'
import { flagModule } from './flags/flag.module'
import { flagHooks } from './flags/flags.hooks'
import { flowBackgroundJobs } from './flows/flow/flow.jobs'
import { humanInputModule } from './flows/flow/human-input/human-input.module'
import { flowRunModule } from './flows/flow-run/flow-run-module'
import { flowModule } from './flows/flow.module'
import { folderModule } from './flows/folder/folder.module'
import { domainHelper } from './helper/domain-helper'
import { exceptionHandler } from './helper/exception-handler'
import { openapiModule } from './helper/openapi/openapi.module'
import { system } from './helper/system/system'
import { AppSystemProp } from './helper/system/system-props'
import { SystemJobName } from './helper/system-jobs/common'
import { systemJobHandlers } from './helper/system-jobs/job-handlers'
import { systemJobsSchedule } from './helper/system-jobs/system-job'
import { validateEnvPropsOnStartup } from './helper/system-validator'
import { knowledgeBaseModule } from './knowledge-base/knowledge-base.module'
import { mcpServerModule } from './mcp/mcp-module'
import { mcpOAuthApproveController } from './mcp/oauth/code/mcp-oauth-approve.controller'
import { memoryModule } from './memory/memory.module'
import { communityBlocksModule } from './pieces/community-piece-module'
import { startDevBlockWatcher } from './pieces/dev-piece-watcher'
import { blockModule } from './pieces/metadata/piece-metadata-controller'
import { blockMetadataService } from './pieces/metadata/piece-metadata-service'
import { blockSyncService } from './pieces/piece-sync-service'
import { tagsModule } from './pieces/tags/tags-module'
import { platformBackgroundJobs } from './platform/platform-jobs'
import { platformModule } from './platform/platform.module'
import { projectHooks } from './project/project-hooks'
import { storeEntryModule } from './store-entry/store-entry.module'
import { tablesModule } from './tables/tables.module'
import { templateModule } from './template/template.module'
import { appEventRoutingModule } from './trigger/app-event-routing/app-event-routing.module'
import { triggerModule } from './trigger/trigger.module'
import { userBadgeModule } from './user/badges/badge-module'
import { platformUserModule } from './user/platform/platform-user-module'
import { invitationModule } from './user-invitations/user-invitation.module'
import { variableModule } from './variable/variable.module'
import { webhookModule } from './webhooks/webhook-module'
import { engineResponseWatcher } from './workers/engine-response-watcher'

import { migrateQueuesAndRunConsumers, workerModule } from './workers/worker-module'

export const setupApp = async (app: FastifyInstance): Promise<FastifyInstance> => {

    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, async (_request: FastifyRequest, payload: unknown) => {
        return payload as Buffer
    })

    registerOpenApiSchemas()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(swagger as any, {
        hideUntagged: true,
        transform: jsonSchemaTransform,
        transformObject: jsonSchemaTransformObject,
        openapi: {
            openapi: '3.1.0',
            servers: [
                {
                    // TODO: stub — confirm the canonical Intellisper production API host before release.
                    // This is the base URL advertised to API consumers and the docs' request playground.
                    // No trailing /v1: every route path already begins with /v1, and OpenAPI
                    // concatenates server.url + path (so /v1 here would render /v1/v1/flows).
                    url: 'https://api.intellisper.com',
                    description: 'Production Server',
                },
            ],
            components: {
                securitySchemes: {
                    apiKey: {
                        type: 'http',
                        description: 'Use your api key generated from the admin console',
                        scheme: 'bearer',
                    },
                },
                schemas: {
                    'global-connection': { $ref: '#/components/schemas/app-connection' },
                },
            },
            info: {
                title: 'Intellisper Documentation',
                version: '0.0.0',
            },
            externalDocs: {
                // TODO: stub — confirm the canonical Intellisper docs host before release.
                url: 'https://docs.intellisper.com',
                description: 'Find more info here',
            },
        },
    })


    await app.register(rateLimitModule)
    app.addHook('onResponse', async (request, reply) => {
        // eslint-disable-next-line
        reply.header('x-request-id', request.id)
    })
    app.addHook('onRequest', async (request, reply) => {
        const route = app.hasRoute({
            method: request.method as HTTPMethods,
            url: request.routeOptions.url!,
        })
        if (!route) {
            return reply.code(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'Route not found',
            })
        }
    })

    app.addHook('preHandler', authenticationMiddleware)
    app.addHook('preHandler', authorizationMiddleware)
    app.addHook('preHandler', rbacMiddleware)

    const canaryAppUrl = system.get(AppSystemProp.CANARY_APP_URL)
    if (!isNil(canaryAppUrl)) {
        await app.register(replyFrom, { base: canaryAppUrl })
        app.addHook('preHandler', canaryRoutingMiddleware)
    }

    await systemJobsSchedule(app.log).init()
    // Licensed self-hosted usage metering & reporting (G.4.b). Registered unconditionally across
    // editions — the license-key gate lives inside the routine, not the registration.
    await flowRunTrackingService(app.log).init()
    // Chat analytics retention prune (H.2.m). Registered unconditionally; deletes local
    // chat_message_metric rows older than the retention window on a daily schedule.
    await chatMetricsPrune(app.log).init()
    // AI Gateway — start the ledger's periodic flush. The sink is the ONLY write path for AI spend;
    // it buffers in memory and never blocks an inference call.
    aiUsageSink(app.log).init()
    await app.register(aiGatewayModule)
    await app.register(fileModule)
    await app.register(flagModule)
    await app.register(storeEntryModule)
    await app.register(folderModule)
    await blockSyncService(app.log).setup()
    await blockMetadataService(app.log).setup()
    await app.register(blockModule)
    await app.register(collaborativeModule)
    await app.register(flowModule)
    await app.register(flowRunModule)
    await app.register(webhookModule)
    await app.register(appConnectionModule)
    await app.register(platformAppConnectionModule)
    await app.register(variableModule)
    await app.register(openapiModule)
    await app.register(appEventRoutingModule)
    await app.register(authenticationModule)
    await app.register(triggerModule)
    await app.register(platformModule)
    await app.register(humanInputModule)
    await app.register(tagsModule)
    await app.register(mcpServerModule)
    await app.register(mcpOAuthApproveController)
    await app.register(agentsModule)
    await app.register(platformUserModule)
    await app.register(alertsModule)
    await app.register(invitationModule)
    await app.register(workerModule)
    await aiProviderService(app.log).setup()
    await app.register(aiProviderModule)
    await app.register(licenseKeysModule)
    await app.register(tablesModule)
    await app.register(knowledgeBaseModule)
    await app.register(userModule)
    await app.register(templateModule)
    await app.register(userBadgeModule)
    await app.register(platformAnalyticsModule)
    systemJobHandlers.registerJobHandler(SystemJobName.DELETE_FLOW, (data) => flowBackgroundJobs(app.log).deleteFlowHandler(data))
    systemJobHandlers.registerJobHandler(SystemJobName.HARD_DELETE_PROJECT, (data) => platformProjectBackgroundJobs(app.log).hardDeleteProjectHandler(data))

    app.get(
        '/redirect',
        async (
            request: FastifyRequest<{ Querystring: { code: string } }>,
            reply,
        ) => {
            const code = request.query.code
            if (!code) {
                return reply.type('text/plain').send('The code is missing in url')
            }
            return reply
                .type('text/html')
                .header('Content-Security-Policy', 'default-src \'none\'; script-src \'unsafe-inline\'')
                .header('X-Content-Type-Options', 'nosniff')
                .send(Mustache.render(REDIRECT_HTML_TEMPLATE, { code }))
        },
    )

    await validateEnvPropsOnStartup(app.log)

    const edition = system.getEdition()
    app.log.info({
        edition,
    }, 'Intellisper Edition')
    switch (edition) {
        case IbEdition.CLOUD:
            await app.register(adminPlatformModule)
            // AI Gateway operator surface — cross-tenant spend, gated by the operator key. CLOUD-only
            // (like adminPlatformModule) so a cross-tenant read can never ship to a self-hosted client.
            await app.register(aiGatewayAdminModule)
            // Browser-agent operator surface — cross-tenant agent activity, operator-key gated, CLOUD-only.
            await app.register(browserAgentActivityAdminModule)
            await app.register(adminPlatformTemplatesCloudModule)
            await app.register(appCredentialModule)
            await app.register(connectionKeyModule)
            await app.register(platformProjectModule)
            await platformAiCreditsService(app.log).init()
            await app.register(platformPlanModule)
            await app.register(projectMemberModule)
            await app.register(signingKeyModule)
            await app.register(authnSsoSamlModule)
            await app.register(managedAuthnModule)
            await app.register(oauthAppModule)
            await app.register(platformBlockModule)
            await app.register(otpModule)
            await app.register(enterpriseLocalAuthnModule)
            await app.register(federatedAuthModule)
            await app.register(apiKeyModule)
            await app.register(gitRepoModule)
            await app.register(auditEventModule)
            await app.register(platformWebhooksModule)
            await app.register(projectRoleModule)
            await app.register(projectReleaseModule)
            await app.register(globalConnectionModule)
            await app.register(secretManagersModule)
            await app.register(scimModule)
            await app.register(embedSubdomainModule)
            await app.register(chatModule)
            await app.register(chatAnalyticsModule)
            // Intellisper browser-automation agent (distinct from agentsModule = flow-step agents).
            await app.register(browserAgentModule)
            // Memory — cross-product (agent + Studio), so registered separately from the agent module
            // and gated on its own `memoryCaps` entitlement rather than on `browserAgentEnabled`.
            await app.register(memoryModule)
            // Automation (Phase 8): register the batch/schedule system-job handlers + runtime hooks,
            // and the presence gateway (app.io userId rooms → work-available push).
            registerBrowserAgentAutomationJobs(app.log)
            registerBrowserAgentPresenceGateway(app.log)
            setPlatformOAuthService(platformOAuth2Service(app.log))
            projectHooks.set(projectEnterpriseHooks)
            flagHooks.set(enterpriseFlagsHooks)
            exceptionHandler.initializeSentry(system.get(AppSystemProp.SENTRY_DSN))
            systemJobHandlers.registerJobHandler(SystemJobName.HARD_DELETE_PLATFORM, (data) => platformBackgroundJobs(app.log).hardDeletePlatformHandler(data))
            break
        case IbEdition.ENTERPRISE:
            await platformAiCreditsService(app.log).init()
            await app.register(platformPlanModule)
            await app.register(platformProjectModule)
            await app.register(projectMemberModule)
            await app.register(signingKeyModule)
            await app.register(authnSsoSamlModule)
            await app.register(managedAuthnModule)
            await app.register(oauthAppModule)
            await app.register(platformBlockModule)
            await app.register(otpModule)
            await app.register(enterpriseLocalAuthnModule)
            await app.register(federatedAuthModule)
            await app.register(apiKeyModule)
            await app.register(gitRepoModule)
            await app.register(auditEventModule)
            await app.register(platformWebhooksModule)
            await app.register(projectRoleModule)
            await app.register(projectReleaseModule)
            await app.register(globalConnectionModule)
            await app.register(secretManagersModule)
            await app.register(scimModule)
            await app.register(embedSubdomainModule)
            await app.register(chatModule)
            await app.register(chatAnalyticsModule)
            // Intellisper browser-automation agent (distinct from agentsModule = flow-step agents).
            await app.register(browserAgentModule)
            // Memory — cross-product (agent + Studio), so registered separately from the agent module
            // and gated on its own `memoryCaps` entitlement rather than on `browserAgentEnabled`.
            await app.register(memoryModule)
            // Automation (Phase 8): register the batch/schedule system-job handlers + runtime hooks,
            // and the presence gateway (app.io userId rooms → work-available push).
            registerBrowserAgentAutomationJobs(app.log)
            registerBrowserAgentPresenceGateway(app.log)
            setPlatformOAuthService(platformOAuth2Service(app.log))
            projectHooks.set(projectEnterpriseHooks)
            flagHooks.set(enterpriseFlagsHooks)
            break
        case IbEdition.COMMUNITY:
            await app.register(platformProjectModule)
            await app.register(communityBlocksModule)
            break
    }

    const isCanaryApp = system.getBoolean(AppSystemProp.IS_CANARY_APP) ?? false
    if (isCanaryApp) {
        app.log.info('[setupApp] Skipping system jobs worker on canary app instance')
    }
    else {
        await systemJobsSchedule(app.log).startWorker()
    }

    app.addHook('onClose', async () => {
        app.log.info('Shutting down')
        // Drain the AI-usage ledger FIRST — while the DB connection is still alive. Anything still
        // buffered is real, already-incurred spend; losing it on every deploy would leave a permanent
        // hole in the cost record.
        await aiUsageSink(app.log).close()
        await systemJobsSchedule(app.log).close()
        await redisConnections.destroy()
        await distributedLock(app.log).destroy()
        await engineResponseWatcher(app.log).shutdown()
    })

    return app
}



export async function getAdapter() {
    const redisConnectionInstance = await redisConnections.useExisting()
    const sub = redisConnectionInstance.duplicate()
    const pub = redisConnectionInstance.duplicate()
    return createAdapter(pub, sub, {
        requestsTimeout: 30000,
    })
}


export async function appPostBoot(app: FastifyInstance): Promise<void> {

    app.log.info(`
 _____   _   _   _______   ______   _        _        _____    _____   _____    ______   _____
|_   _| | \\ | | |__   __| |  ____| | |      | |      |_   _|  / ____| |  __ \\  |  ____| |  __ \\
  | |   |  \\| |    | |    | |__    | |      | |        | |   | (___   | |__) | | |__    | |__) |
  | |   | . \` |    | |    |  __|   | |      | |        | |    \\___ \\  |  ___/  |  __|   |  _  /
 _| |_  | |\\  |    | |    | |____  | |____  | |____   _| |_   ____) | | |      | |____  | | \\ \\
|_____| |_| \\_|    |_|    |______| |______| |______| |_____| |_____/  |_|      |______| |_|  \\_\\

The application started on ${await domainHelper.getPublicApiUrl({ path: '' })}, as specified by the IB_FRONTEND_URL variables.`)

    const environment = system.get(AppSystemProp.ENVIRONMENT)
    const blocks = process.env.IB_DEV_BLOCKS

    await migrateQueuesAndRunConsumers(app)
    app.log.info('Queues migrated and consumers run')
    if (environment === IbEnvironment.DEVELOPMENT) {
        app.log.warn(
            `[WARNING]: The application is running in ${environment} mode.`,
        )
        app.log.warn(
            `[WARNING]: This only shows blocks specified in IB_DEV_BLOCKS ${blocks} environment variable.`,
        )
    }
    void startDevBlockWatcher(app)
}

function registerOpenApiSchemas() {
    globalRegistry.add(FlowCreatedEvent, { id: ApplicationEventName.FLOW_CREATED })
    globalRegistry.add(FlowUpdatedEvent, { id: ApplicationEventName.FLOW_UPDATED })
    globalRegistry.add(FlowDeletedEvent, { id: ApplicationEventName.FLOW_DELETED })
    globalRegistry.add(FlowPublishedEvent, { id: ApplicationEventName.FLOW_PUBLISHED })
    globalRegistry.add(FlowActivatedEvent, { id: ApplicationEventName.FLOW_ACTIVATED })
    globalRegistry.add(FlowDeactivatedEvent, { id: ApplicationEventName.FLOW_DEACTIVATED })
    globalRegistry.add(ConnectionUpsertedEvent, { id: ApplicationEventName.CONNECTION_UPSERTED })
    globalRegistry.add(ConnectionDeletedEvent, { id: ApplicationEventName.CONNECTION_DELETED })
    globalRegistry.add(FolderCreatedEvent, { id: ApplicationEventName.FOLDER_CREATED })
    globalRegistry.add(FolderUpdatedEvent, { id: ApplicationEventName.FOLDER_UPDATED })
    globalRegistry.add(FolderDeletedEvent, { id: ApplicationEventName.FOLDER_DELETED })
    globalRegistry.add(FlowRunStartedEvent, { id: ApplicationEventName.FLOW_RUN_STARTED })
    globalRegistry.add(FlowRunFinishedEvent, { id: ApplicationEventName.FLOW_RUN_FINISHED })
    globalRegistry.add(FlowRunRetriedEvent, { id: ApplicationEventName.FLOW_RUN_RETRIED })
    globalRegistry.add(SignUpEvent, { id: ApplicationEventName.USER_SIGNED_UP })
    globalRegistry.add(UserSignedInEvent, { id: ApplicationEventName.USER_SIGNED_IN })
    globalRegistry.add(UserPasswordResetEvent, { id: ApplicationEventName.USER_PASSWORD_RESET })
    globalRegistry.add(UserEmailVerifiedEvent, { id: ApplicationEventName.USER_EMAIL_VERIFIED })
    globalRegistry.add(SigningKeyEvent, { id: ApplicationEventName.SIGNING_KEY_CREATED })
    globalRegistry.add(ProjectRoleEvent, { id: ApplicationEventName.PROJECT_ROLE_CREATED })
    globalRegistry.add(ProjectReleaseEvent, { id: ApplicationEventName.PROJECT_RELEASE_CREATED })
    globalRegistry.add(Template, { id: 'template' })
    globalRegistry.add(Folder, { id: 'folder' })
    globalRegistry.add(UserWithMetaInformation, { id: 'user' })
    globalRegistry.add(UserInvitation, { id: 'user-invitation' })
    globalRegistry.add(ProjectMember, { id: 'project-member' })
    globalRegistry.add(ProjectWithLimits, { id: 'project' })
    globalRegistry.add(Flow, { id: 'flow' })
    globalRegistry.add(FlowRun, { id: 'flow-run' })
    globalRegistry.add(AppConnectionWithoutSensitiveData, { id: 'app-connection' })
    globalRegistry.add(BlockMetadata, { id: 'piece' })
    globalRegistry.add(GitRepoWithoutSensitiveData, { id: 'git-repo' })
    globalRegistry.add(ProjectRelease, { id: 'project-release' })
    globalRegistry.add(AddAllowedEmbedOriginsRequestBody, { id: 'embedding' })
}

const REDIRECT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Redirect</title></head>
<body>
Redirect successful, this window should close now.
<meta id="ap-oauth-code" content="{{code}}">
<script>
(function () {
    var el = document.getElementById('ap-oauth-code');
    var code = el ? el.getAttribute('content') : null;
    if (window.opener && code) {
        window.opener.postMessage({ code: code }, '*');
    }
})();
</script>
</body>
</html>`
