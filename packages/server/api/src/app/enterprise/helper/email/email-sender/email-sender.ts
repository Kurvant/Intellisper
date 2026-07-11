// Clean-room implementation — the pluggable email-transport contract (capability spec A.1).
//
// Two senders satisfy this interface: a real SMTP transport and a development/no-op log
// sender. The active sender is chosen by environment (see index.ts). Every send is a
// fully-rendered message (subject + HTML) fanned out to one or more recipients, optionally
// carrying a reply-to address. `isSmtpConfigured` is a public capability probe (used by the
// invitation link-fallback and the frontend SMTP flag). `validateOrThrow` is an optional
// pre-flight that verifies transport reachability/credentials in production.
import { FastifyBaseLogger } from 'fastify'

export type SendEmailArgs = {
    // One or more recipient addresses; an empty set is a no-op skip (never an error).
    emails: string[]
    subject: string
    html: string
    // Optional reply-to (e.g. conversational-agent notifications route replies to the human).
    replyTo?: string
    // Sender identity + branding for this message (falls back to platform/system defaults).
    senderName: string
    senderEmail: string
}

export type EmailSender = {
    // Whether a real SMTP transport is fully configured (host, port, username, password all
    // present). A public contract — callers branch on it (e.g. show an invitation link inline
    // when email cannot be delivered).
    isSmtpConfigured(): boolean

    // Deliver a rendered message. The no-op/log sender MUST never throw; the real transport
    // may rethrow so a caller that must know can react, but the account/operational paths that
    // wrap this degrade safely (an email problem never aborts the triggering operation).
    send(args: SendEmailArgs): Promise<void>

    // Optional pre-flight: in production, verify the transport and raise a typed
    // invalid-credentials error on failure; outside production it is a no-op.
    validateOrThrow(): Promise<void>
}

export type EmailSenderFactory = (log: FastifyBaseLogger) => EmailSender
