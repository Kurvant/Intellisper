/**
 * Sends ONE email per production template to a recipient, rendered by the REAL template code
 * (renderEmailTemplate + the branded shell) with representative sample variables — exactly
 * what production sends, delivered via the ZeptoMail REST config in .env.production.
 *
 * Usage (from packages/server/api):  npx tsx scripts/send-template-previews.ts <recipient>
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    EmailBranding,
    EmailTemplateName,
    EmailTemplateVars,
    renderEmailTemplate,
} from '../src/app/enterprise/helper/email/email-templates'

const to = process.argv[2]
if (!to || !/.+@.+\..+/.test(to)) {
    console.error('Usage: npx tsx scripts/send-template-previews.ts <recipient-email>')
    process.exit(1)
}

// ---- config from the repo-root .env.production (scripts -> api -> server -> packages -> root)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const env: Record<string, string> = {}
for (const line of readFileSync(path.join(root, '.env.production'), 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    env[t.slice(0, i)] = t.slice(i + 1)
}
const url = env.IB_EMAIL_REST_URL
const authHeader = env.IB_EMAIL_REST_AUTH_HEADER || 'Authorization'
const authValue = env.IB_EMAIL_REST_AUTH_VALUE
const senderEmail = env.IB_SMTP_SENDER_EMAIL || 'noreply@kurvant.com'
const senderName = env.IB_SMTP_SENDER_NAME || 'Intellisper'
if (!url || !authValue || authValue.startsWith('OBTAIN')) {
    console.error('IB_EMAIL_REST_URL / IB_EMAIL_REST_AUTH_VALUE not configured in .env.production')
    process.exit(1)
}

// ---- branding as production resolves it for the default platform (text header: the shell
// falls back to the platform name when no absolute logo URL is available)
const branding: EmailBranding = {
    platformName: 'Intellisper',
    primaryColor: '#b5652f',
    logoIconUrl: '',
}

const site = (env.IB_FRONTEND_URL || 'https://intellisper.com').replace(/\/+$/, '')

// ---- representative sample variables, one entry per template in the catalog
const samples: { [T in EmailTemplateName]: EmailTemplateVars[T] } = {
    [EmailTemplateName.OTP_EMAIL_VERIFICATION]: {
        userFirstName: 'Kurvant',
        otpLink: `${site}/verify-email?otpcode=SAMPLE-CODE`,
    },
    [EmailTemplateName.OTP_PASSWORD_RESET]: {
        userFirstName: 'Kurvant',
        otpLink: `${site}/reset-password?otpcode=SAMPLE-CODE`,
    },
    [EmailTemplateName.INVITATION]: {
        invitationLink: `${site}/invitation?token=SAMPLE-TOKEN`,
        platformName: 'Intellisper',
    },
    [EmailTemplateName.PROJECT_MEMBER_ADDED]: {
        projectName: 'Demo Project',
        platformName: 'Intellisper',
    },
    [EmailTemplateName.BADGE_AWARDED]: {
        badgeName: 'First Flow Published',
    },
    [EmailTemplateName.ISSUE_CREATED]: {
        flowName: 'Daily Lead Sync',
        issueUrl: `${site}/projects/SAMPLE/issues`,
        stepName: 'Send Slack Message',
        stepNumber: 3,
        errorMessage: 'Request failed with status 429 (rate limited)',
        timestamp: new Date().toUTCString(),
    },
    [EmailTemplateName.QUOTA_ALERT]: {
        resourceName: 'AI credits',
        upgradeUrl: `${site}/platform/setup/billing`,
    },
    [EmailTemplateName.REMINDER]: {
        message: 'Your trial ends in 3 days — pick a plan to keep your flows running.',
    },
    [EmailTemplateName.FAILURE_THRESHOLD_ALERT]: {
        flowName: 'Daily Lead Sync',
        issueUrl: `${site}/projects/SAMPLE/issues`,
    },
}

// ---- render with the REAL production renderer, deliver via the ZeptoMail wire shape
async function main(): Promise<void> {
    const names = Object.values(EmailTemplateName)
    let failed = 0
    for (const [i, name] of names.entries()) {
        const rendered = renderEmailTemplate(name, samples[name] as never, branding)
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                [authHeader]: authValue,
            },
            body: JSON.stringify({
                from: { address: senderEmail, name: senderName },
                to: [{ email_address: { address: to } }],
                subject: rendered.subject,
                htmlbody: rendered.html,
            }),
        })
        const ok = res.ok
        if (!ok) failed++
        console.log(`${ok ? 'OK ' : 'FAIL'}  [${i + 1}/${names.length}] ${name}  ->  "${rendered.subject}"  (HTTP ${res.status})`)
        if (!ok) console.log('      ' + (await res.text()))
        // Gentle pacing so the batch is not throttled.
        await new Promise((r) => setTimeout(r, 800))
    }
    console.log(failed === 0 ? `\nAll ${names.length} template previews sent to ${to}.` : `\n${failed} of ${names.length} sends failed.`)
    process.exit(failed === 0 ? 0 : 1)
}

void main()
