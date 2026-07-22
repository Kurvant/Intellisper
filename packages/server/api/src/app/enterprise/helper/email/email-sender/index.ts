// Clean-room implementation — email-sender selection (capability spec A.1 "sender selection").
//
// The active sender is chosen by environment + transport preference:
//   - TEST        → always the no-op/log sender (the suite must never send real mail);
//   - IB_EMAIL_TRANSPORT=REST  → the provider-agnostic REST transport;
//   - IB_EMAIL_TRANSPORT=SMTP  → the nodemailer SMTP transport;
//   - unset (auto)             → REST when fully configured, else SMTP — REST is the
//                                preferred transport; existing SMTP-only deployments are
//                                unaffected because an unconfigured REST never wins auto;
//   - non-production with the selected transport unconfigured → the log sender
//     (preserving zero-setup local dev). In PRODUCTION the selected real transport is
//     always returned so misconfiguration surfaces loudly instead of silently logging.
import { IbEnvironment } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { EmailSender } from './email-sender'
import { logEmailSender } from './log-email-sender'
import { restEmailSender } from './rest-email-sender'
import { smtpEmailSender } from './smtp-email-sender'

export { smtpEmailSender } from './smtp-email-sender'
export { restEmailSender, RestEmailProvider } from './rest-email-sender'
export { logEmailSender } from './log-email-sender'
export type { EmailSender, SendEmailArgs } from './email-sender'
export { DEFAULT_SENDER_EMAIL } from './email-sender'

export enum EmailTransport {
    SMTP = 'SMTP',
    REST = 'REST',
}

export function getEmailSender(log: FastifyBaseLogger): EmailSender {
    const environment = system.getOrThrow<IbEnvironment>(AppSystemProp.ENVIRONMENT)
    if (environment === IbEnvironment.TESTING) {
        return logEmailSender(log)
    }
    const selected = selectTransport(log)
    if (environment === IbEnvironment.PRODUCTION || selected.isConfigured()) {
        return selected
    }
    return logEmailSender(log)
}

function selectTransport(log: FastifyBaseLogger): EmailSender {
    const transport = system.get<EmailTransport>(AppSystemProp.EMAIL_TRANSPORT)
    const rest = restEmailSender(log)
    const smtp = smtpEmailSender(log)
    switch (transport) {
        case EmailTransport.REST:
            return rest
        case EmailTransport.SMTP:
            return smtp
        default:
            // Auto: prefer REST when configured, otherwise SMTP (matches pre-REST behavior
            // for every deployment that has no IB_EMAIL_REST_* configuration).
            return rest.isConfigured() ? rest : smtp
    }
}
