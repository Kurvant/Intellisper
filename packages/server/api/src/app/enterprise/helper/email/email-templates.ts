// Clean-room implementation — named email templates (capability spec A.1 "templated
// messages"). Each template has a fixed set of TYPED variables, a PER-TEMPLATE subject line,
// and renders to HTML wrapped in a shared, BRANDED shell (organization logo + primary color +
// footer). The template-name → variables and template-name → subject mappings are public
// contracts. Rendering is done with Mustache (HTML-escaped by default).
import Mustache from 'mustache'

// Branding applied at render time (spec A.1 "branding applied at render time" / D.2). Resolved
// from the originating organization, falling back to platform/system defaults.
export type EmailBranding = {
    platformName: string
    primaryColor: string
    logoIconUrl: string
    // The managed-cloud footer may carry a legal address; empty elsewhere.
    footerAddress?: string
}

// The catalog of template names. Adding a message type is a change here plus a template entry.
export enum EmailTemplateName {
    OTP_EMAIL_VERIFICATION = 'otp-email-verification',
    OTP_PASSWORD_RESET = 'otp-password-reset',
    INVITATION = 'invitation',
    PROJECT_MEMBER_ADDED = 'project-member-added',
    BADGE_AWARDED = 'badge-awarded',
    ISSUE_CREATED = 'issue-created',
    QUOTA_ALERT = 'quota-alert',
    REMINDER = 'reminder',
    FAILURE_THRESHOLD_ALERT = 'failure-threshold-alert',
}

// The typed variable set for each template. This map is the public template → variables
// contract callers depend on.
export type EmailTemplateVars = {
    [EmailTemplateName.OTP_EMAIL_VERIFICATION]: { userFirstName: string, otpLink: string }
    [EmailTemplateName.OTP_PASSWORD_RESET]: { userFirstName: string, otpLink: string }
    [EmailTemplateName.INVITATION]: { invitationLink: string, platformName: string }
    [EmailTemplateName.PROJECT_MEMBER_ADDED]: { projectName: string, platformName: string }
    [EmailTemplateName.BADGE_AWARDED]: { badgeName: string }
    [EmailTemplateName.ISSUE_CREATED]: {
        flowName: string
        issueUrl: string
        stepName: string
        stepNumber: number
        errorMessage: string
        timestamp: string
    }
    [EmailTemplateName.QUOTA_ALERT]: { resourceName: string, upgradeUrl: string }
    [EmailTemplateName.REMINDER]: { message: string }
    [EmailTemplateName.FAILURE_THRESHOLD_ALERT]: { flowName: string, issueUrl: string }
}

type TemplateDefinition<T extends EmailTemplateName> = {
    subject: (vars: EmailTemplateVars[T]) => string
    body: (vars: EmailTemplateVars[T]) => string
}

// A branded call-to-action button. The URL is HTML-escaped here (it is known when the body
// string is built); the primary color is filled by the body's Mustache render via {{&color}}.
function button(url: string, label: string): string {
    return `<a href="${Mustache.escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:{{&color}};color:#ffffff;text-decoration:none;font-weight:600">${Mustache.escape(label)}</a>`
}

const templates: { [T in EmailTemplateName]: TemplateDefinition<T> } = {
    [EmailTemplateName.OTP_EMAIL_VERIFICATION]: {
        subject: () => 'Verify your email address',
        body: (v) => `<p>Hi {{userFirstName}},</p>
<p>Please verify your email address to activate your account.</p>
<p>${button(v.otpLink, 'Verify email')}</p>`,
    },
    [EmailTemplateName.OTP_PASSWORD_RESET]: {
        subject: () => 'Reset your password',
        body: (v) => `<p>Hi {{userFirstName}},</p>
<p>We received a request to reset your password. If this was you, continue below.</p>
<p>${button(v.otpLink, 'Reset password')}</p>
<p>If you did not request this, you can safely ignore this email.</p>`,
    },
    [EmailTemplateName.INVITATION]: {
        subject: (v) => `You've been invited to join ${v.platformName}`,
        body: (v) => `<p>You've been invited to join <strong>{{platformName}}</strong>.</p>
<p>${button(v.invitationLink, 'Accept invitation')}</p>`,
    },
    [EmailTemplateName.PROJECT_MEMBER_ADDED]: {
        subject: (v) => `You've been added to ${v.projectName}`,
        body: () => '<p>You\'ve been added to the project <strong>{{projectName}}</strong> on {{platformName}}.</p>',
    },
    [EmailTemplateName.BADGE_AWARDED]: {
        subject: (v) => `You earned the ${v.badgeName} badge`,
        body: () => '<p>Congratulations! You\'ve earned the <strong>{{badgeName}}</strong> badge.</p>',
    },
    [EmailTemplateName.ISSUE_CREATED]: {
        subject: (v) => `Automation failed: ${v.flowName}`,
        body: (v) => `<p>The automation <strong>{{flowName}}</strong> failed at step <strong>{{stepName}}</strong> (step #{{stepNumber}}) on {{timestamp}}.</p>
<p style="background:#fef2f2;border-left:3px solid #f94949;padding:8px 12px;color:#7b1f1f">{{errorMessage}}</p>
<p>${button(v.issueUrl, 'View failed run')}</p>`,
    },
    [EmailTemplateName.QUOTA_ALERT]: {
        subject: (v) => `You're approaching your ${v.resourceName} limit`,
        body: (v) => `<p>Your organization is approaching its <strong>{{resourceName}}</strong> limit.</p>
<p>${button(v.upgradeUrl, 'Review plan')}</p>`,
    },
    [EmailTemplateName.REMINDER]: {
        subject: () => 'Reminder',
        body: () => '<p>{{message}}</p>',
    },
    [EmailTemplateName.FAILURE_THRESHOLD_ALERT]: {
        subject: (v) => `Automation failing repeatedly: ${v.flowName}`,
        body: (v) => `<p>The automation <strong>{{flowName}}</strong> has crossed its configured failure threshold.</p>
<p>${button(v.issueUrl, 'View issue')}</p>`,
    },
}

// Wrap a rendered body in the branded shell: a header carrying the organization logo/name and
// a footer (with an optional legal address on the managed cloud).
function wrapInShell(bodyHtml: string, branding: EmailBranding): string {
    const shell = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2933">
  <div style="padding:24px 0;text-align:center;border-bottom:2px solid {{&primaryColor}}">
    {{#logoIconUrl}}<img src="{{logoIconUrl}}" alt="{{platformName}}" style="height:40px" />{{/logoIconUrl}}
    {{^logoIconUrl}}<strong style="font-size:20px">{{platformName}}</strong>{{/logoIconUrl}}
  </div>
  <div style="padding:24px 0;font-size:15px;line-height:1.6">
    ${bodyHtml}
  </div>
  <div style="padding:16px 0;border-top:1px solid #e4e7eb;font-size:12px;color:#7b8794">
    <p>Sent by {{platformName}}.</p>
    {{#footerAddress}}<p>{{footerAddress}}</p>{{/footerAddress}}
  </div>
</div>`
    return Mustache.render(shell, {
        platformName: branding.platformName,
        primaryColor: branding.primaryColor,
        logoIconUrl: branding.logoIconUrl,
        footerAddress: branding.footerAddress,
    })
}

export type RenderedEmail = {
    subject: string
    html: string
}

// Render a named template with its typed variables, branded per the originating organization.
// The body Mustache-renders the template's variables; the shell then applies branding.
export function renderEmailTemplate<T extends EmailTemplateName>(
    name: T,
    vars: EmailTemplateVars[T],
    branding: EmailBranding,
): RenderedEmail {
    const template = templates[name]
    const bodyTemplate = template.body(vars)
    const renderedBody = Mustache.render(bodyTemplate, { ...vars, color: branding.primaryColor })
    const html = wrapInShell(renderedBody, branding)
    return {
        subject: template.subject(vars),
        html,
    }
}
