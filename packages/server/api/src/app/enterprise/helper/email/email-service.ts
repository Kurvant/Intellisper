// Clean-room implementation — transactional email service (capability spec A.1). The account
// and operational message layer: it renders a named, branded template and delivers it through
// the environment-selected sender (real SMTP in production, no-op/log in test / unconfigured
// dev). Every path degrades safely — an email problem NEVER aborts the operation that
// triggered it.
//
// Business rules enforced here:
//  - Branding at render time: each message is themed with the originating organization's name,
//    logo, and primary color, falling back to platform/system defaults (D.2).
//  - Edition gating: identity-verification codes and automation-issue notifications are
//    paid-edition only and are a no-op in the community edition; invitations, member-added, and
//    password reset are available in every edition.
//  - Skip rules: no verification code to an already-verified identity; no send to a recipient
//    without a valid email; an empty recipient set sends nothing. None of these is an error.
import {
    IbEdition,
    isNil,
    OtpType,
    PlatformId,
    UserIdentity,
    UserInvitation,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { domainHelper } from '../../../helper/domain-helper'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { platformService } from '../../../platform/platform.service'
import { userService } from '../../../user/user-service'
import { getEmailSender } from './email-sender'
import {
    EmailBranding,
    EmailTemplateName,
    EmailTemplateVars,
    renderEmailTemplate,
} from './email-templates'

// System-default branding used when no organization context is available or an attribute is
// missing (fail-safe, per D.2 default theme).
// Path (relative to the public URL) of the self-hosted Intellisper logo. Emails render
// off-domain, so this is made absolute at send time via domainHelper.getPublicUrl.
const DEFAULT_LOGO_PATH = '/intellisper-logo.png'

const DEFAULT_BRANDING: EmailBranding = {
    platformName: 'Intellisper',
    primaryColor: '#6e41e2',
    logoIconUrl: DEFAULT_LOGO_PATH,
}

function isPaidEdition(): boolean {
    return system.getEdition() !== IbEdition.COMMUNITY
}

export const emailService = (log: FastifyBaseLogger) => {
    const sender = getEmailSender(log)

    // Resolve the branding for a message from its originating organization; any missing input
    // (or a null organization context) falls back to the system default.
    // A root-relative logo path (e.g. the self-hosted default) must become absolute for
    // an email client to load it. Fully-qualified URLs are left untouched.
    async function absolutizeLogo(branding: EmailBranding): Promise<EmailBranding> {
        if (!branding.logoIconUrl.startsWith('/')) {
            return branding
        }
        return { ...branding, logoIconUrl: await domainHelper.getPublicUrl({ path: branding.logoIconUrl }) }
    }

    async function resolveBranding(platformId: PlatformId | null | undefined): Promise<EmailBranding> {
        if (isNil(platformId)) {
            return absolutizeLogo(DEFAULT_BRANDING)
        }
        const platform = await platformService(log).getOne(platformId)
        if (isNil(platform)) {
            return absolutizeLogo(DEFAULT_BRANDING)
        }
        const footerAddress = system.getEdition() === IbEdition.CLOUD
            ? system.get(AppSystemProp.SMTP_SENDER_NAME)
            : undefined
        return absolutizeLogo({
            platformName: platform.name && platform.name.trim() !== '' ? platform.name : DEFAULT_BRANDING.platformName,
            primaryColor: platform.primaryColor && platform.primaryColor.trim() !== '' ? platform.primaryColor : DEFAULT_BRANDING.primaryColor,
            logoIconUrl: platform.logoIconUrl && platform.logoIconUrl.trim() !== '' ? platform.logoIconUrl : DEFAULT_BRANDING.logoIconUrl,
            ...(isNil(footerAddress) ? {} : { footerAddress }),
        })
    }

    // The from-identity for outbound mail: configurable sender identity/branding, falling back
    // to the branding platform name and a system sender address.
    function resolveSender(branding: EmailBranding): { senderName: string, senderEmail: string } {
        const senderName = system.get(AppSystemProp.SMTP_SENDER_NAME) ?? branding.platformName
        const senderEmail = system.get(AppSystemProp.SMTP_SENDER_EMAIL) ?? 'noreply@activepieces.com'
        return { senderName, senderEmail }
    }

    // Render + deliver a named template to a recipient set. Empty/invalid recipients skip.
    // Failure is isolated: a delivery error is logged and swallowed (never rethrown to callers).
    async function dispatch<T extends EmailTemplateName>(params: {
        emails: (string | null | undefined)[]
        platformId: PlatformId | null | undefined
        template: T
        vars: EmailTemplateVars[T]
        replyTo?: string
    }): Promise<void> {
        const recipients = params.emails.filter((email): email is string => !isNil(email) && email.trim() !== '')
        if (recipients.length === 0) {
            return
        }
        try {
            const branding = await resolveBranding(params.platformId)
            const { subject, html } = renderEmailTemplate(params.template, params.vars, branding)
            const { senderName, senderEmail } = resolveSender(branding)
            await sender.send({
                emails: recipients,
                subject,
                html,
                senderName,
                senderEmail,
                ...(isNil(params.replyTo) ? {} : { replyTo: params.replyTo }),
            })
        }
        catch (error) {
            log.warn({ error, template: params.template }, '[emailService] email delivery failed; continuing')
        }
    }

    return {
        // One-time verification / reset code (B.2). Verification codes are paid-edition only and
        // are never sent to an already-verified identity; both cases skip, not error. The code
        // is delivered as a link to the corresponding flow.
        async sendOtp(params: { platformId: PlatformId | null, userIdentity: UserIdentity, otp: string, type: OtpType }): Promise<void> {
            const { platformId, userIdentity, otp, type } = params
            if (isNil(userIdentity.email) || userIdentity.email.trim() === '') {
                return
            }
            if (type === OtpType.EMAIL_VERIFICATION) {
                if (!isPaidEdition() || userIdentity.verified) {
                    return
                }
                const otpLink = await domainHelper.getPublicUrl({
                    path: `verify-email?otpcode=${encodeURIComponent(otp)}&identityId=${encodeURIComponent(userIdentity.id)}`,
                })
                await dispatch({
                    emails: [userIdentity.email],
                    platformId,
                    template: EmailTemplateName.OTP_EMAIL_VERIFICATION,
                    vars: { userFirstName: userIdentity.firstName, otpLink },
                })
                return
            }
            // Password reset — available in every edition.
            const otpLink = await domainHelper.getPublicUrl({
                path: `reset-password?otpcode=${encodeURIComponent(otp)}&email=${encodeURIComponent(userIdentity.email)}`,
            })
            await dispatch({
                emails: [userIdentity.email],
                platformId,
                template: EmailTemplateName.OTP_PASSWORD_RESET,
                vars: { userFirstName: userIdentity.firstName, otpLink },
            })
        },

        // Member invitation (all editions).
        async sendInvitation(params: { userInvitation: UserInvitation, invitationLink: string }): Promise<void> {
            const { userInvitation, invitationLink } = params
            const branding = await resolveBranding(userInvitation.platformId)
            await dispatch({
                emails: [userInvitation.email],
                platformId: userInvitation.platformId,
                template: EmailTemplateName.INVITATION,
                vars: { invitationLink, platformName: branding.platformName },
            })
        },

        // Member-added notice (all editions).
        async sendProjectMemberAdded(params: { userInvitation: UserInvitation }): Promise<void> {
            const { userInvitation } = params
            const branding = await resolveBranding(userInvitation.platformId)
            await dispatch({
                emails: [userInvitation.email],
                platformId: userInvitation.platformId,
                template: EmailTemplateName.PROJECT_MEMBER_ADDED,
                vars: { projectName: userInvitation.projectId ?? 'your project', platformName: branding.platformName },
            })
        },

        // Achievement / badge notice (all editions). Resolves the recipient email from the user.
        async sendBadgeAwardedEmail(userId: string, badgeName: string): Promise<void> {
            const user = await userService(log).getMetaInformation({ id: userId }).catch(() => undefined)
            if (isNil(user)) {
                return
            }
            await dispatch({
                emails: [user.email],
                platformId: user.platformId,
                template: EmailTemplateName.BADGE_AWARDED,
                vars: { badgeName },
            })
        },

        // Automation-issue notification (paid-edition only). Recipients come from the caller.
        async sendIssueCreatedNotification(params: {
            platformId: PlatformId
            emails: string[]
            flowName: string
            issueUrl: string
            stepName: string
            stepNumber: number
            errorMessage: string
            timestamp: string
        }): Promise<void> {
            if (!isPaidEdition()) {
                return
            }
            await dispatch({
                emails: params.emails,
                platformId: params.platformId,
                template: EmailTemplateName.ISSUE_CREATED,
                vars: {
                    flowName: params.flowName,
                    issueUrl: params.issueUrl,
                    stepName: params.stepName,
                    stepNumber: params.stepNumber,
                    errorMessage: params.errorMessage,
                    timestamp: params.timestamp,
                },
            })
        },

        // Quota alert (all editions).
        async sendQuotaAlert(params: { platformId: string, emails: string[], resourceName: string, upgradeUrl: string }): Promise<void> {
            await dispatch({
                emails: params.emails,
                platformId: params.platformId,
                template: EmailTemplateName.QUOTA_ALERT,
                vars: { resourceName: params.resourceName, upgradeUrl: params.upgradeUrl },
            })
        },

        // Operational reminder (all editions).
        async sendReminder(params: { platformId: string, emails: string[], message: string }): Promise<void> {
            await dispatch({
                emails: params.emails,
                platformId: params.platformId,
                template: EmailTemplateName.REMINDER,
                vars: { message: params.message },
            })
        },

        // Repeated-failure threshold alert (paid-edition only).
        async sendExceedFailureThresholdAlert(params: { platformId: PlatformId, emails: string[], flowName: string, issueUrl: string }): Promise<void> {
            if (!isPaidEdition()) {
                return
            }
            await dispatch({
                emails: params.emails,
                platformId: params.platformId,
                template: EmailTemplateName.FAILURE_THRESHOLD_ALERT,
                vars: { flowName: params.flowName, issueUrl: params.issueUrl },
            })
        },
    }
}
