// Clean-room implementation — provider-agnostic REST email transport (capability spec A.1).
//
// POSTs a fully-rendered message to a configurable HTTPS endpoint, authenticated by a single
// configurable header. The wire body is selected by IB_EMAIL_REST_PROVIDER:
//   GENERIC   → a neutral JSON shape ({from, to[], subject, html, replyTo}) for any relay
//               service you control;
//   ZEPTOMAIL → Zoho ZeptoMail's transactional Send Mail API (api.zeptomail.com/v1.1/email,
//               auth header value "Zoho-enczapikey <token>").
// "Configured" is all-or-nothing: URL AND auth value must both be present. A send under an
// unconfigured transport is a safe no-op that never throws; a delivery failure logs and
// rethrows (email-service isolates it — callers are never aborted by mail problems).
// ALL outbound HTTP goes through `safeHttp` (SSRF-guarded) per .claude/rules/safe-http.md.
import { safeHttp } from '@intelblocks/server-utils'
import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { EmailSender, SendEmailArgs } from './email-sender'

export enum RestEmailProvider {
    GENERIC = 'GENERIC',
    ZEPTOMAIL = 'ZEPTOMAIL',
}

type RestSettings = {
    url: string
    authHeader: string
    authValue: string
    provider: RestEmailProvider
}

// Resolve the full REST setting set, or null when a required field is missing (partial =
// unconfigured). Header name and provider have safe defaults.
function resolveRestSettings(): RestSettings | null {
    const url = system.get(AppSystemProp.EMAIL_REST_URL)
    const authValue = system.get(AppSystemProp.EMAIL_REST_AUTH_VALUE)
    if (isNil(url) || isNil(authValue)) {
        return null
    }
    const provider = system.get<RestEmailProvider>(AppSystemProp.EMAIL_REST_PROVIDER) ?? RestEmailProvider.GENERIC
    return {
        url,
        authValue,
        authHeader: system.get(AppSystemProp.EMAIL_REST_AUTH_HEADER) ?? 'Authorization',
        provider,
    }
}

function buildBody(provider: RestEmailProvider, args: SendEmailArgs): unknown {
    switch (provider) {
        case RestEmailProvider.ZEPTOMAIL:
            return {
                from: { address: args.senderEmail, name: args.senderName },
                to: args.emails.map((address) => ({ email_address: { address } })),
                subject: args.subject,
                htmlbody: args.html,
                ...(isNil(args.replyTo) ? {} : { reply_to: [{ address: args.replyTo }] }),
            }
        case RestEmailProvider.GENERIC:
        default:
            return {
                from: { email: args.senderEmail, name: args.senderName },
                to: args.emails.map((email) => ({ email })),
                subject: args.subject,
                html: args.html,
                ...(isNil(args.replyTo) ? {} : { replyTo: args.replyTo }),
            }
    }
}

export const restEmailSender = (log: FastifyBaseLogger): EmailSender => ({
    isConfigured(): boolean {
        return !isNil(resolveRestSettings())
    },

    async send(args: SendEmailArgs): Promise<void> {
        const settings = resolveRestSettings()
        if (isNil(settings) || args.emails.length === 0) {
            // Unconfigured transport or no recipients → safe no-op (never abort the caller).
            return
        }
        const res = await safeHttp.axios.post(settings.url, buildBody(settings.provider, args), {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                [settings.authHeader]: settings.authValue,
            },
            timeout: 15_000,
            validateStatus: () => true,
        })
        if (res.status < 200 || res.status >= 300) {
            log.warn({ status: res.status, provider: settings.provider }, '[restEmailSender] delivery failed')
            // Rethrow like the SMTP transport does — email-service logs + swallows, so a mail
            // problem never aborts the triggering operation.
            throw new Error(`REST email delivery failed with status ${res.status}`)
        }
        log.info({ recipients: args.emails.length, subject: args.subject, provider: settings.provider }, '[restEmailSender] email sent')
    },

    async validateOrThrow(): Promise<void> {
        // REST providers expose no universal credential-verification endpoint (and a probe send
        // would deliver real mail), so misconfiguration surfaces on the first real send instead.
    },
})
