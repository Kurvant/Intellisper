// Clean-room implementation — real SMTP transport (capability spec A.1). Built on the
// nodemailer public API. The transport is configured entirely from environment system
// properties (SMTP was moved off the platform record); "configured" is all-or-nothing — it
// counts as configured only when host, port, username, AND password are all present. A send
// under an unconfigured transport is a safe no-op that never throws.
import {
    IntellisperError,
    IbEdition,
    IbEnvironment,
    ErrorCode,
    isNil,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import nodemailer, { Transporter } from 'nodemailer'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { EmailSender, SendEmailArgs } from './email-sender'

type SmtpSettings = {
    host: string
    port: number
    username: string
    password: string
}

// Resolve the full SMTP setting set, or null when any required field is missing (partial =
// unconfigured). Port must be a valid number.
function resolveSmtpSettings(): SmtpSettings | null {
    const host = system.get(AppSystemProp.SMTP_HOST)
    const port = system.getNumber(AppSystemProp.SMTP_PORT)
    const username = system.get(AppSystemProp.SMTP_USERNAME)
    const password = system.get(AppSystemProp.SMTP_PASSWORD)
    if (isNil(host) || isNil(port) || isNil(username) || isNil(password)) {
        return null
    }
    return { host, port, username, password }
}

function createTransport(settings: SmtpSettings): Transporter {
    return nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        // Standard SMTP convention: implicit TLS on 465, STARTTLS otherwise.
        secure: settings.port === 465,
        auth: {
            user: settings.username,
            pass: settings.password,
        },
    })
}

export const smtpEmailSender = (log: FastifyBaseLogger): EmailSender => ({
    isSmtpConfigured(): boolean {
        return !isNil(resolveSmtpSettings())
    },

    async send(args: SendEmailArgs): Promise<void> {
        const settings = resolveSmtpSettings()
        if (isNil(settings) || args.emails.length === 0) {
            // Unconfigured transport or no recipients → safe no-op (never abort the caller).
            return
        }
        const transport = createTransport(settings)
        try {
            await transport.sendMail({
                from: `${args.senderName} <${args.senderEmail}>`,
                to: args.emails,
                subject: args.subject,
                html: args.html,
                ...(isNil(args.replyTo) ? {} : { replyTo: args.replyTo }),
            })
            log.info({ recipients: args.emails.length, subject: args.subject }, '[smtpEmailSender] email sent')
        }
        finally {
            transport.close()
        }
    },

    // Production-only pre-flight: verify the transport authenticates; raise a typed error so a
    // misconfiguration surfaces at setup time. Outside production it is a no-op.
    async validateOrThrow(): Promise<void> {
        const environment = system.getOrThrow<IbEnvironment>(AppSystemProp.ENVIRONMENT)
        const edition = system.getEdition()
        if (environment !== IbEnvironment.PRODUCTION || edition === IbEdition.COMMUNITY) {
            return
        }
        const settings = resolveSmtpSettings()
        if (isNil(settings)) {
            return
        }
        const transport = createTransport(settings)
        try {
            await transport.verify()
        }
        catch (error) {
            log.warn({ error }, '[smtpEmailSender] SMTP verification failed')
            throw new IntellisperError({
                code: ErrorCode.INVALID_SMTP_CREDENTIALS,
                params: {
                    message: error instanceof Error ? error.message : 'SMTP credentials could not be verified',
                },
            })
        }
        finally {
            transport.close()
        }
    },
})
