// Clean-room implementation — email-sender selection (capability spec A.1 "sender selection").
//
// The active sender is chosen by environment:
//   - TEST        → always the no-op/log sender (the suite must never send real mail);
//   - PRODUCTION  → always the real SMTP transport;
//   - otherwise   → the real SMTP transport ONLY IF fully configured, else the log sender
//                   (preserving zero-setup local dev).
import { IbEnvironment } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { EmailSender } from './email-sender'
import { logEmailSender } from './log-email-sender'
import { smtpEmailSender } from './smtp-email-sender'

export { smtpEmailSender } from './smtp-email-sender'
export { logEmailSender } from './log-email-sender'
export type { EmailSender, SendEmailArgs } from './email-sender'

export function getEmailSender(log: FastifyBaseLogger): EmailSender {
    const environment = system.getOrThrow<IbEnvironment>(AppSystemProp.ENVIRONMENT)
    if (environment === IbEnvironment.TESTING) {
        return logEmailSender(log)
    }
    const smtp = smtpEmailSender(log)
    if (environment === IbEnvironment.PRODUCTION || smtp.isSmtpConfigured()) {
        return smtp
    }
    return logEmailSender(log)
}
