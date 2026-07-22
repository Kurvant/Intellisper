import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * REST email sender: configuration gating, GENERIC vs ZEPTOMAIL wire bodies, auth header,
 * no-op cases, and error propagation. safeHttp is mocked — no real HTTP.
 */

const { postMock, envMap } = vi.hoisted(() => ({
    postMock: vi.fn(),
    envMap: new Map<string, string | undefined>(),
}))

vi.mock('@intelblocks/server-utils', () => ({
    safeHttp: { axios: { post: postMock } },
}))
vi.mock('../../../../../src/app/helper/system/system', () => ({
    system: {
        get: (prop: string) => envMap.get(prop),
        getNumber: (prop: string) => (envMap.has(prop) ? Number(envMap.get(prop)) : null),
    },
}))

import { restEmailSender, RestEmailProvider } from '../../../../../src/app/enterprise/helper/email/email-sender/rest-email-sender'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

const ARGS = {
    emails: ['to@x.com'],
    subject: 'Hi',
    html: '<p>Body</p>',
    senderName: 'Intellisper',
    senderEmail: 'noreply@intellisper.com',
}

beforeEach(() => {
    postMock.mockReset().mockResolvedValue({ status: 200, data: {} })
    envMap.clear()
    envMap.set('EMAIL_REST_URL', 'https://mail.example.com/send')
    envMap.set('EMAIL_REST_AUTH_VALUE', 'Bearer k')
})

describe('configuration gating', () => {
    it('is unconfigured without a URL, and send is then a no-op', async () => {
        envMap.delete('EMAIL_REST_URL')
        const sender = restEmailSender(log)
        expect(sender.isConfigured()).toBe(false)
        await sender.send(ARGS)
        expect(postMock).not.toHaveBeenCalled()
    })

    it('is unconfigured without an auth value', () => {
        envMap.delete('EMAIL_REST_AUTH_VALUE')
        expect(restEmailSender(log).isConfigured()).toBe(false)
    })

    it('is configured with URL + auth value', () => {
        expect(restEmailSender(log).isConfigured()).toBe(true)
    })

    it('empty recipient set is a no-op', async () => {
        await restEmailSender(log).send({ ...ARGS, emails: [] })
        expect(postMock).not.toHaveBeenCalled()
    })
})

describe('wire bodies', () => {
    it('GENERIC (default) posts the neutral shape with the auth header', async () => {
        await restEmailSender(log).send({ ...ARGS, replyTo: 'r@x.com' })
        const [url, body, cfg] = postMock.mock.calls[0]
        expect(url).toBe('https://mail.example.com/send')
        expect(body).toEqual({
            from: { email: 'noreply@intellisper.com', name: 'Intellisper' },
            to: [{ email: 'to@x.com' }],
            subject: 'Hi',
            html: '<p>Body</p>',
            replyTo: 'r@x.com',
        })
        expect(cfg.headers.Authorization).toBe('Bearer k')
    })

    it('ZEPTOMAIL posts the ZeptoMail Send Mail shape', async () => {
        envMap.set('EMAIL_REST_PROVIDER', RestEmailProvider.ZEPTOMAIL)
        envMap.set('EMAIL_REST_AUTH_VALUE', 'Zoho-enczapikey token')
        await restEmailSender(log).send({ ...ARGS, replyTo: 'r@x.com' })
        const [, body] = postMock.mock.calls[0]
        expect(body).toEqual({
            from: { address: 'noreply@intellisper.com', name: 'Intellisper' },
            to: [{ email_address: { address: 'to@x.com' } }],
            subject: 'Hi',
            htmlbody: '<p>Body</p>',
            reply_to: [{ address: 'r@x.com' }],
        })
    })

    it('a custom auth header name is honoured', async () => {
        envMap.set('EMAIL_REST_AUTH_HEADER', 'X-Api-Key')
        await restEmailSender(log).send(ARGS)
        const [, , cfg] = postMock.mock.calls[0]
        expect(cfg.headers['X-Api-Key']).toBe('Bearer k')
        expect(cfg.headers.Authorization).toBeUndefined()
    })
})

describe('delivery outcomes', () => {
    it('non-2xx rethrows (email-service isolates it)', async () => {
        postMock.mockResolvedValue({ status: 401, data: {} })
        await expect(restEmailSender(log).send(ARGS)).rejects.toThrow(/401/)
    })

    it('2xx resolves', async () => {
        await expect(restEmailSender(log).send(ARGS)).resolves.toBeUndefined()
    })
})
