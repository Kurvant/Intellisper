// Clean-room implementation — federated (social) sign-in orchestration (capability spec
// B.4). Drives the OIDC authorization-code flow: hand the browser a provider login URL,
// then exchange the returned code for verified identity claims and turn them into an
// authenticated session via the shared federated sign-in path. Also exposes the OAuth
// callback URL, which the flag service surfaces to the frontend in every edition.
import { AuthenticationResponse, FederatedAuthnLoginResponse, UserIdentityProvider } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { authenticationService } from '../../../authentication/authentication.service'
import { domainHelper } from '../../../helper/domain-helper'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { googleAuthnProvider } from './google-authn-provider'

type LoginParams = {
    platformId: string | undefined
}

type ClaimParams = {
    platformId: string | undefined
    code: string
}

export const federatedAuthnService = (log: FastifyBaseLogger) => ({

    // Build the provider consent URL the browser should be redirected to.
    async login({ platformId }: LoginParams): Promise<FederatedAuthnLoginResponse> {
        const { clientId } = getGoogleCredentials()
        const loginUrl = await googleAuthnProvider(log).getLoginUrl({ clientId, platformId })
        return { loginUrl }
    },

    // Exchange the returned authorization code for verified claims and sign the user in,
    // scoped to the resolved platform (or onboarding when there is none).
    async claim({ platformId, code }: ClaimParams): Promise<AuthenticationResponse> {
        const { clientId, clientSecret } = getGoogleCredentials()
        const idToken = await googleAuthnProvider(log).authenticate({
            clientId,
            clientSecret,
            authorizationCode: code,
            platformId,
        })
        return authenticationService(log).federatedAuthn({
            email: idToken.email,
            firstName: idToken.firstName ?? 'john',
            lastName: idToken.lastName ?? 'doe',
            trackEvents: true,
            newsLetter: true,
            provider: UserIdentityProvider.GOOGLE,
            predefinedPlatformId: platformId ?? null,
            imageUrl: idToken.imageUrl,
        })
    },

    // The OAuth callback URL registered with the provider; the frontend redirects here
    // after consent so the SPA can post the code back to /claim.
    async getThirdPartyRedirectUrl(): Promise<string> {
        return domainHelper.getInternalUrl({ path: '/redirect' })
    },
})

function getGoogleCredentials(): { clientId: string, clientSecret: string } {
    return {
        clientId: system.getOrThrow(AppSystemProp.GOOGLE_CLIENT_ID),
        clientSecret: system.getOrThrow(AppSystemProp.GOOGLE_CLIENT_SECRET),
    }
}
