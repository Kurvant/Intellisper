// Clean-room implementation — Google OpenID Connect provider (capability spec B.4).
// Implements the two halves of the OIDC authorization-code flow against Google: build the
// consent-screen URL the browser is sent to, and exchange the returned code for an ID
// token which is then cryptographically verified (signature against Google's published
// JWKS, plus issuer/audience/email-verified checks) before its claims are trusted.
import { safeHttp } from '@intelblocks/server-utils'
import { assertNotEqual, ErrorCode, IntellisperError, isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import jwksClient from 'jwks-rsa'
import { JwtSignAlgorithm, jwtUtils } from '../../../helper/jwt-utils'
import { federatedAuthnService } from './federated-authn-service'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

// Google rotates its signing keys; the client caches and rate-limits key fetches so
// verification does not hit the JWKS endpoint on every login.
const jwks = jwksClient({
    jwksUri: GOOGLE_JWKS_URL,
    cache: true,
    rateLimit: true,
})

export type FederatedAuthnIdToken = {
    email: string
    firstName: string
    lastName: string
    imageUrl?: string
}

type GetLoginUrlParams = {
    clientId: string
    platformId: string | undefined
}

type AuthenticateParams = {
    clientId: string
    clientSecret: string
    authorizationCode: string
    platformId: string | undefined
}

export const googleAuthnProvider = (log: FastifyBaseLogger) => ({

    // The URL the browser is redirected to for Google consent. The redirect_uri must be
    // the app's own callback (the same value is replayed at token exchange).
    async getLoginUrl({ clientId }: GetLoginUrlParams): Promise<string> {
        const url = new URL(GOOGLE_AUTH_URL)
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('redirect_uri', await federatedAuthnService(log).getThirdPartyRedirectUrl())
        url.searchParams.set('scope', 'email profile')
        url.searchParams.set('response_type', 'code')
        return url.href
    },

    // Exchange the authorization code for an ID token and return its verified claims.
    async authenticate({ clientId, clientSecret, authorizationCode }: AuthenticateParams): Promise<FederatedAuthnIdToken> {
        const idToken = await exchangeCodeForIdToken(log, clientId, clientSecret, authorizationCode)
        return verifyIdToken(clientId, idToken)
    },

    // Verify a CLIENT-SUPPLIED Google id_token (implicit/id-token flow — e.g. a Chrome extension
    // using chrome.identity). No code exchange: the token was minted directly for `audience` (the
    // extension's own OAuth client id), and we verify it against Google's JWKS exactly as the
    // code-exchange path does — same signature/issuer/audience/email-verified checks. This is the ONLY
    // difference from `authenticate`: the token arrives pre-minted rather than being redeemed from a code.
    async verifyClientIdToken({ audience, idToken }: { audience: string, idToken: string }): Promise<FederatedAuthnIdToken> {
        return verifyIdToken(audience, idToken)
    },
})

// Redeem the one-time code at Google's token endpoint. Uses the SSRF-guarded HTTP client
// per the outbound-HTTP rule for OAuth token endpoints.
async function exchangeCodeForIdToken(log: FastifyBaseLogger, clientId: string, clientSecret: string, code: string): Promise<string> {
    const redirectUri = await federatedAuthnService(log).getThirdPartyRedirectUrl()
    const response = await safeHttp.axios.post<{ id_token?: string }>(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    const idToken = response.data.id_token
    if (isNil(idToken)) {
        throw new IntellisperError({ code: ErrorCode.INVALID_CREDENTIALS, params: null }, 'Google token exchange returned no id_token')
    }
    return idToken
}

// Verify the ID token's signature against the key named by its header, then its issuer,
// audience, and that the email was verified by Google — only then trust its claims.
async function verifyIdToken(clientId: string, idToken: string): Promise<FederatedAuthnIdToken> {
    const { header } = jwtUtils.decode<GoogleIdTokenClaims>({ jwt: idToken })
    const signingKey = await jwks.getSigningKey(header.kid)
    const publicKey = signingKey.getPublicKey()

    const claims = await jwtUtils.decodeAndVerify<GoogleIdTokenClaims>({
        jwt: idToken,
        key: publicKey,
        algorithm: JwtSignAlgorithm.RS256,
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
    })
    assertNotEqual(claims.email_verified, false, 'claims.email_verified', 'Google email is not verified')

    return {
        email: claims.email,
        firstName: claims.given_name,
        lastName: claims.family_name,
        imageUrl: claims.picture,
    }
}

type GoogleIdTokenClaims = {
    email: string
    email_verified: boolean
    given_name: string
    family_name: string
    picture?: string
    sub: string
    aud: string
    iss: string
}
