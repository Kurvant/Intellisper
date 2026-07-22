import { PrincipalType, WebsocketClientEvent, WebsocketServerEvent } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { app } from '../../server'
import { setBrowserAgentWorkNudge } from './browser-agent-automation.jobs'
import { browserAgentPresence } from './presence.service'

/**
 * Presence gateway (Phase 8). Bridges blockunits' `app.io` (rooms keyed by userId — a USER socket
 * already joins its own `principal.id` room on connect) to the browser-agent automation presence +
 * work-available push:
 *  - On a USER socket CONNECT → refresh Redis presence (the extension is live) so batch rows may be
 *    admitted onto this session.
 *  - On DISCONNECT → clear presence immediately.
 *  - `nudge(userId)` → emit `BROWSER_AGENT_WORK_AVAILABLE` to that user's room; the extension then
 *    pulls the next action via GET /work/claim. Idempotent — a missed nudge self-corrects because
 *    the extension also polls on (re)connect.
 *
 * This wires the batch/schedule side's `notifyWorkAvailable` (via setBrowserAgentWorkNudge) so those
 * services stay decoupled from Socket.IO. Multi-instance-safe: the emit uses the Redis socket adapter
 * (configured in server.ts) so a nudge reaches the user's socket wherever it's connected.
 */
export function registerBrowserAgentPresenceGateway(log: FastifyBaseLogger): void {
    const presence = browserAgentPresence(log)

    // Refresh presence when a user's socket connects (its extension is now live). The principal is
    // re-derived on DISCONNECT, so we don't need to track the socket here.
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.CONNECT, () => async (_data, principal) => {
        await presence.heartbeat(principal.id).catch((err) => log.warn({ err: (err as Error).message }, '[baPresence] connect heartbeat failed'))
    })

    // Clear presence on disconnect so an offline extension stops receiving admitted rows.
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.DISCONNECT, () => async (_data, principal) => {
        await presence.clear(principal.id).catch((err) => log.warn({ err: (err as Error).message }, '[baPresence] disconnect clear failed'))
    })

    // Wire the work-available nudge so batch/schedule creation + row-done can push to the extension.
    setBrowserAgentWorkNudge((userId: string) => {
        try {
            if (app?.io) {
                websocketService.to(userId).emit(WebsocketClientEvent.BROWSER_AGENT_WORK_AVAILABLE, { at: undefined })
            }
        }
        catch (err) {
            log.warn({ err: (err as Error).message }, '[baPresence] work-available nudge failed')
        }
    })
}
