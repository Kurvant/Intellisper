import { TemplateTelemetryEvent } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

/**
 * Template telemetry relay has been removed for this edition. Upstream this
 * POSTed template view/install/activate events to cloud.activepieces.com and
 * template-manager.activepieces.com; no template usage data leaves this server
 * now. The sendEvent() surface is kept as a dormant no-op so call sites are
 * unchanged and a first-party sink can be added later.
 */
export const templateTelemetryService = (log: FastifyBaseLogger) => ({
    sendEvent(event: TemplateTelemetryEvent): void {
        const telemetryEnabled = system.getBoolean(AppSystemProp.TELEMETRY_ENABLED)
        if (telemetryEnabled && system.get(AppSystemProp.ENVIRONMENT) !== 'prod') {
            log.debug({ eventType: event.eventType }, 'Template telemetry event captured (local only, not relayed)')
        }
        // no-op: no external relay
    },
})
