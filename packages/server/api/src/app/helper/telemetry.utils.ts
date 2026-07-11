import { ProjectId, TelemetryEvent, User, UserId, UserIdentity } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from './system/system'
import { AppSystemProp } from './system/system-props'

/**
 * Telemetry relay to external analytics (Segment) has been removed for this
 * edition — no user data ever leaves this server. The event taxonomy
 * (TelemetryEvent / TelemetryEventName) and these call sites are intentionally
 * preserved as a dormant no-op sink, so a future first-party analytics backend
 * can be wired in without re-plumbing every caller.
 *
 * The AP_TELEMETRY_ENABLED flag gates whether events are logged locally; it can
 * no longer cause any outbound network request.
 */
const telemetryEnabled = system.getBoolean(AppSystemProp.TELEMETRY_ENABLED)
const debugLog = system.get(AppSystemProp.ENVIRONMENT) !== 'prod'

export const telemetry = (log: FastifyBaseLogger) => ({
    async identify(_identity: UserIdentity, _user?: User, _projectId?: ProjectId): Promise<void> {
        // no-op: no external relay
        return
    },
    async trackPlatform(platformId: ProjectId, event: TelemetryEvent): Promise<void> {
        await this.trackUser(platformId, event)
    },
    async trackProject(
        _projectId: ProjectId,
        event: TelemetryEvent,
    ): Promise<void> {
        await this.trackUser(_projectId, event)
    },
    isEnabled: () => telemetryEnabled,
    async trackUser(_userId: UserId, event: TelemetryEvent): Promise<void> {
        if (telemetryEnabled && debugLog) {
            log.debug({ event: event.name }, '[Telemetry#trackUser] event captured (local only, not relayed)')
        }
        return
    },
})
