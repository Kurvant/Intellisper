import { AgentBatchJobStatus } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { getEmailSender } from '../../enterprise/helper/email/email-sender'
import { DEFAULT_SENDER_EMAIL } from '../../enterprise/helper/email/email-sender/email-sender'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { userService } from '../../user/user-service'
import { AgentBatchJobEntity } from '../entities'

/**
 * Sends completion / needs-attention notifications for automation runs and batches via the
 * PLATFORM email transport (getEmailSender — REST or SMTP; one email configuration for the whole
 * system). Best-effort — a notification failure NEVER blocks or fails a
 * run. Honours the per-batch/schedule `notify` preferences ({ onDone, onFailed, onNeedsAttention,
 * email }). Recipient resolution honours ownership: the email is the batch OWNER's identity email
 * (or an explicit override in the notify prefs) — never another user's, so this side channel can't
 * leak across the tenant boundary.
 *
 * agentScope-exempt: the only DB read is a batch BY PRIMARY KEY, supplied by the trusted runtime/
 * queue (not a client request); the recipient is resolved to the batch's OWN owner. Ownership was
 * enforced upstream at batch creation, so there is no client-supplied boundary to re-check here.
 */

const batchRepo = repoFactory(AgentBatchJobEntity)

type NotifyPrefs = { onDone?: boolean, onFailed?: boolean, onNeedsAttention?: boolean, email?: string }

function siteUrl(): string {
    return system.get(AppSystemProp.BROWSER_AGENT_SITE_URL)
        ?? system.get(AppSystemProp.FRONTEND_URL)
        ?? 'https://intellisper.kurvant.com'
}

function textToHtml(lines: string[]): string {
    // Plain operational content → minimal HTML (delivered as an HTML body). Escaped, line-broken.
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${lines.map((l) => esc(l) || '<br>').join('<br>')}</div>`
}

// Sender identity mirrors the email service's resolution (configurable, with the same
// system-wide fallbacks) so agent notifications match the rest of the platform's mail.
function sendViaPlatform(log: FastifyBaseLogger, to: string, subject: string, html: string): Promise<void> {
    return getEmailSender(log).send({
        emails: [to],
        subject,
        html,
        senderName: system.get(AppSystemProp.SMTP_SENDER_NAME) ?? 'Intellisper',
        senderEmail: system.get(AppSystemProp.SMTP_SENDER_EMAIL) ?? DEFAULT_SENDER_EMAIL,
    })
}

export const browserAgentNotifier = (log: FastifyBaseLogger) => ({
    /** Notify on a finished BATCH (done / completed-with-errors / failed), honouring notify prefs. */
    async batchFinished(batchId: string): Promise<void> {
        try {
            if (!getEmailSender(log).isConfigured()) return
            const batch = await batchRepo().findOneBy({ id: batchId })
            if (!batch) return
            const notify = (batch.notify ?? {}) as NotifyPrefs
            const failed = batch.status === AgentBatchJobStatus.FAILED || batch.status === AgentBatchJobStatus.COMPLETED_WITH_ERRORS
            // Only send if the user opted in for THIS outcome.
            if (failed ? !notify.onFailed : !notify.onDone) return
            const to = await this.recipient(batch.userId, notify.email)
            if (!to) return

            const subject = failed
                ? `Your automation finished with ${batch.rowsFailed} failed row(s)`
                : 'Your automation completed'
            const body = textToHtml([
                failed ? 'Your batch automation finished, but some rows failed.' : 'Your batch automation completed successfully.',
                '',
                `Total rows: ${batch.rowsTotal}`,
                `Completed: ${batch.rowsCompleted}`,
                `Failed: ${batch.rowsFailed}`,
                '',
                `View it: ${siteUrl()}/dashboard/automation/batches/${batch.id}`,
            ])
            await sendViaPlatform(log, to, subject, body)
        }
        catch (err) {
            log.warn({ err: (err as Error).message }, '[browserAgentNotifier] batchFinished notify failed (ignored)')
        }
    },

    /**
     * Notify that an UNATTENDED run parked awaiting a human decision (a consequential step it won't
     * auto-run). Resolves the batch's notify prefs from its id when this run is part of a batch.
     */
    async needsAttention(userId: string, batchJobId: string | undefined, what: string): Promise<void> {
        try {
            if (!getEmailSender(log).isConfigured()) return
            let notify: NotifyPrefs | null = null
            if (batchJobId) {
                const batch = await batchRepo().findOneBy({ id: batchJobId })
                notify = (batch?.notify as NotifyPrefs) ?? null
            }
            if (!notify?.onNeedsAttention) return
            const to = await this.recipient(userId, notify.email)
            if (!to) return
            const body = textToHtml([
                'An automation needs your approval to continue.',
                '',
                `Action: ${what}`,
                '',
                `Open Intellisper to approve or reject it: ${siteUrl()}/dashboard`,
            ])
            await sendViaPlatform(log, to, 'Your automation needs your approval', body)
        }
        catch (err) {
            log.warn({ err: (err as Error).message }, '[browserAgentNotifier] needsAttention notify failed (ignored)')
        }
    },

    /**
     * Resolve the recipient: an explicit valid override in the notify prefs, else the OWNER's identity
     * email. Ownership-bound — we only ever email the batch's own user (or their chosen override).
     */
    async recipient(userId: string, override?: string): Promise<string | null> {
        if (override && /.+@.+\..+/.test(override)) return override
        try {
            const meta = await userService(log).getMetaInformation({ id: userId })
            return meta.email ?? null
        }
        catch {
            return null
        }
    },
})
