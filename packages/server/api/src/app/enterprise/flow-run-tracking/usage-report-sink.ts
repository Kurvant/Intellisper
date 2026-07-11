// Clean-room implementation — usage-report event sink (capability spec G.4.b). The destination for
// licensed self-hosted usage/meter events. This is BILLING data (keyed by the organization's
// license key), NOT product telemetry, so it is deliberately INDEPENDENT of the product-telemetry
// opt-in flag: a telemetry-disabled instance still reports usage if it is licensed.
//
// This edition ships with the external relay removed (no data leaves the server), so the default
// sink is a fire-and-forget local capture (logged) — a first-party analytics/billing backend can
// be wired in here without changing any caller. Transport is fire-and-forget: no response is
// consumed and a sink error never propagates to the reporting routine.
import { FastifyBaseLogger } from 'fastify'

// One usage-report event: the distinct-id is the organization's license key; the payload is the
// stable G.4.b snapshot shape.
export type UsageReportEvent = {
    distinctId: string
    event: string
    payload: Record<string, unknown>
}

export const USAGE_REPORT_EVENT_NAME = 'self_hosted_usage_report'

export const usageReportSink = (log: FastifyBaseLogger) => ({
    // Fire-and-forget capture of a single usage-report event. Never throws.
    capture(event: UsageReportEvent): void {
        try {
            log.info({
                distinctId: event.distinctId,
                event: event.event,
                payload: event.payload,
            }, '[usageReportSink] usage report captured (local sink; wire a first-party billing backend here)')
        }
        catch (error) {
            log.warn({ error }, '[usageReportSink] failed to capture usage report event')
        }
    },
})
