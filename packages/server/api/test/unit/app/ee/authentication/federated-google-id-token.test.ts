import { ErrorCode, IntellisperError } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The extension Google sign-in path (`claimExtensionIdToken`) verifies a CLIENT-SUPPLIED id_token
 * against the EXTENSION's own OAuth client id, then mints a session via the shared federated path.
 * These tests pin the two things unique to this path:
 *   1. deny-by-default when GOOGLE_CLIENT_ID_INTELLISPER is unset (feature simply off), and
 *   2. it verifies against THAT audience (not the web GOOGLE_CLIENT_ID) and forwards the verified
 *      claims to federatedAuthn.
 * The underlying JWKS/signature verification is the same code the auth-code flow already exercises.
 */

const getSystemProp = vi.fn()
const verifyClientIdToken = vi.fn()
const federatedAuthn = vi.fn()

vi.mock('../../../../../src/app/helper/system/system', () => ({
    system: { get: (k: string) => getSystemProp(k), getOrThrow: (k: string) => getSystemProp(k) },
}))

vi.mock('../../../../../src/app/enterprise/authentication/federated-authn/google-authn-provider', () => ({
    googleAuthnProvider: () => ({ verifyClientIdToken }),
}))

vi.mock('../../../../../src/app/authentication/authentication.service', () => ({
    authenticationService: () => ({ federatedAuthn }),
}))

// domain-helper is imported transitively; stub so the module loads without the full app.
vi.mock('../../../../../src/app/helper/domain-helper', () => ({
    domainHelper: { getInternalUrl: async () => 'https://example.test/redirect' },
}))

const { federatedAuthnService } = await import('../../../../../src/app/enterprise/authentication/federated-authn/federated-authn-service')

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => federatedAuthnService(log)

beforeEach(() => {
    getSystemProp.mockReset()
    verifyClientIdToken.mockReset()
    federatedAuthn.mockReset()
})

describe('claimExtensionIdToken', () => {
    it('DENIES when GOOGLE_CLIENT_ID_INTELLISPER is not configured (feature off, never a silent pass)', async () => {
        getSystemProp.mockImplementation((k: string) => (k === 'GOOGLE_CLIENT_ID_INTELLISPER' ? undefined : 'x'))

        const err = await svc().claimExtensionIdToken({ idToken: 'tok', platformId: undefined }).then(() => null, (e) => e)
        expect(err).toBeInstanceOf(IntellisperError)
        expect((err as IntellisperError).error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
        // It must not have attempted verification or session minting when the feature is off.
        expect(verifyClientIdToken).not.toHaveBeenCalled()
        expect(federatedAuthn).not.toHaveBeenCalled()
    })

    it('verifies against the EXTENSION audience and mints a session from the verified claims', async () => {
        getSystemProp.mockImplementation((k: string) => (k === 'GOOGLE_CLIENT_ID_INTELLISPER' ? 'ext-client-id.apps.googleusercontent.com' : 'x'))
        verifyClientIdToken.mockResolvedValue({ email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace', imageUrl: 'https://img' })
        federatedAuthn.mockResolvedValue({ token: 'jwt', projectId: 'proj1', platformId: 'plat1', id: 'user1' })

        const res = await svc().claimExtensionIdToken({ idToken: 'the-id-token', platformId: 'plat1' })

        // Verified with the EXTENSION's client id as audience — NOT the web GOOGLE_CLIENT_ID.
        expect(verifyClientIdToken).toHaveBeenCalledWith({ audience: 'ext-client-id.apps.googleusercontent.com', idToken: 'the-id-token' })
        // The verified claims were forwarded to the shared federated session path.
        expect(federatedAuthn).toHaveBeenCalledWith(expect.objectContaining({
            email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace', provider: 'GOOGLE', predefinedPlatformId: 'plat1',
        }))
        expect(res).toMatchObject({ token: 'jwt', projectId: 'proj1' })
    })

    it('passes predefinedPlatformId as null when no platform is resolved (new-user onboarding)', async () => {
        getSystemProp.mockImplementation((k: string) => (k === 'GOOGLE_CLIENT_ID_INTELLISPER' ? 'ext-id' : 'x'))
        verifyClientIdToken.mockResolvedValue({ email: 'n@ew.com', firstName: 'New', lastName: 'User' })
        federatedAuthn.mockResolvedValue({ token: 'onboarding-jwt', projectId: null, platformId: null, id: 'u2' })

        await svc().claimExtensionIdToken({ idToken: 't', platformId: undefined })

        expect(federatedAuthn).toHaveBeenCalledWith(expect.objectContaining({ predefinedPlatformId: null }))
    })
})
