// Clean-room implementation — development / no-op email sender (capability spec A.1). Used in
// the test environment (the automated suite must never send real mail) and as the fallback in
// non-production when the real transport is not fully configured (preserving zero-setup dev).
// It reports the transport as unconfigured and logs sends instead of delivering them. It
// MUST never throw.
import { FastifyBaseLogger } from 'fastify'
import { EmailSender, SendEmailArgs } from './email-sender'

export const logEmailSender = (log: FastifyBaseLogger): EmailSender => ({
    isConfigured(): boolean {
        return false
    },

    async send(args: SendEmailArgs): Promise<void> {
        log.debug({
            recipients: args.emails,
            subject: args.subject,
            senderEmail: args.senderEmail,
        }, '[logEmailSender] email not delivered (no transport configured); logging only')
    },

    async validateOrThrow(): Promise<void> {
        // No transport to validate.
    },
})
