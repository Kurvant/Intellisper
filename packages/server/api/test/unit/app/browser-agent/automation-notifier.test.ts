import { AgentBatchJobStatus } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Notifier (Phase 8, unified email). Verifies the notify-prefs gating (only send for the outcome
 * the user opted into), ownership-bound recipient resolution, and that an unconfigured platform
 * email transport makes the notifier a no-op (automation still runs). The platform email sender
 * (getEmailSender) is mocked at the module boundary so no SMTP/HTTP happens.
 */

const { sendMock, isConfiguredMock, batchFindOneBy, getMetaInformation } = vi.hoisted(() => ({
    sendMock: vi.fn().mockResolvedValue(undefined),
    isConfiguredMock: vi.fn().mockReturnValue(true),
    batchFindOneBy: vi.fn(),
    getMetaInformation: vi.fn(),
}))

vi.mock('../../../../src/app/enterprise/helper/email/email-sender', () => ({
    getEmailSender: () => ({ isConfigured: isConfiguredMock, send: sendMock }),
}))
vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({ findOneBy: batchFindOneBy }),
}))
vi.mock('../../../../src/app/user/user-service', () => ({
    userService: () => ({ getMetaInformation }),
}))
vi.mock('../../../../src/app/helper/system/system', () => ({
    system: { get: () => undefined },
}))

import { browserAgentNotifier } from '../../../../src/app/browser-agent/automation/automation-notifier'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentNotifier(log)

// The unified sender takes a single SendEmailArgs object.
const sentArgs = (i = 0) => sendMock.mock.calls[i][0] as { emails: string[], subject: string, html: string, senderEmail: string }

beforeEach(() => {
    sendMock.mockReset().mockResolvedValue(undefined)
    isConfiguredMock.mockReset().mockReturnValue(true)
    batchFindOneBy.mockReset()
    getMetaInformation.mockReset().mockResolvedValue({ email: 'owner@x.com' })
})

describe('batchFinished — notify-prefs gating', () => {
    it('emails the OWNER on success when onDone is set', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', status: AgentBatchJobStatus.COMPLETED, notify: { onDone: true }, rowsTotal: 3, rowsCompleted: 3, rowsFailed: 0 })
        await svc().batchFinished('b1')
        expect(sendMock).toHaveBeenCalledTimes(1)
        expect(sentArgs().emails).toEqual(['owner@x.com'])
        expect(sentArgs().subject).toMatch(/completed/i)
        // Sender identity falls back to the system default when IB_SMTP_SENDER_EMAIL is unset.
        expect(sentArgs().senderEmail).toBe('noreply@kurvant.com')
    })

    it('does NOT email on success when onDone is not set', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', status: AgentBatchJobStatus.COMPLETED, notify: { onFailed: true }, rowsTotal: 3, rowsCompleted: 3, rowsFailed: 0 })
        await svc().batchFinished('b1')
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('emails on failure only when onFailed is set', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', status: AgentBatchJobStatus.COMPLETED_WITH_ERRORS, notify: { onFailed: true }, rowsTotal: 3, rowsCompleted: 2, rowsFailed: 1 })
        await svc().batchFinished('b1')
        expect(sendMock).toHaveBeenCalledTimes(1)
        expect(sentArgs().subject).toMatch(/failed/i)
    })

    it('honours an explicit email OVERRIDE over the owner email', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', status: AgentBatchJobStatus.COMPLETED, notify: { onDone: true, email: 'ops@team.com' }, rowsTotal: 1, rowsCompleted: 1, rowsFailed: 0 })
        await svc().batchFinished('b1')
        expect(sentArgs().emails).toEqual(['ops@team.com'])
        expect(getMetaInformation).not.toHaveBeenCalled()
    })

    it('is a NO-OP when no email transport is configured (automation still runs)', async () => {
        isConfiguredMock.mockReturnValue(false)
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', status: AgentBatchJobStatus.COMPLETED, notify: { onDone: true }, rowsTotal: 1, rowsCompleted: 1, rowsFailed: 0 })
        await svc().batchFinished('b1')
        expect(sendMock).not.toHaveBeenCalled()
        expect(batchFindOneBy).not.toHaveBeenCalled()
    })
})

describe('needsAttention — parked consequential step', () => {
    it('emails the owner only when onNeedsAttention is set on the batch', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', notify: { onNeedsAttention: true } })
        await svc().needsAttention('u1', 'b1', 'Submit the payment form')
        expect(sendMock).toHaveBeenCalledTimes(1)
        expect(sentArgs().html).toMatch(/Submit the payment form/)
    })

    it('does NOT email when the pref is off', async () => {
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', notify: { onNeedsAttention: false } })
        await svc().needsAttention('u1', 'b1', 'x')
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('a sender failure is swallowed (never throws to the caller)', async () => {
        sendMock.mockRejectedValue(new Error('boom'))
        batchFindOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', notify: { onNeedsAttention: true } })
        await expect(svc().needsAttention('u1', 'b1', 'x')).resolves.toBeUndefined()
    })
})
