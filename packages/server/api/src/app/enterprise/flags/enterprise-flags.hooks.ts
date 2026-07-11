// Clean-room implementation — enterprise feature-flag hooks (capability spec I.7 entitlement-
// resolver variation point + D.2 consumption surface). Installed via flagHooks.set in
// CLOUD/ENTERPRISE. This is the ENHANCED variation of the flags service: the base edition emits
// system-default flags unchanged (the pass-through hook); the enterprise variation resolves the
// flags that legitimately differ per organization — the caller's platform branding (THEME, D.2)
// and its platform-specific authentication configuration (which SSO providers to show, the SAML
// assertion-consumer URL, and whether cloud/email auth are enabled) — and substitutes them into
// the flags map the frontend consumes. All other flags pass through unchanged.
//
// Fail-safe (I.3): a null/unknown organization context (unauthenticated / infrastructure
// principal) leaves the base auth flags in place and resolves the theme to the default. Any
// error resolving platform data degrades to the base flags rather than failing the /v1/flags
// read (which must remain available even unauthenticated — see the CE flags test).
import {
    IbFlagId,
    isNil,
    PrincipalType,
    ThirdPartyAuthnProviderEnum,
    ThirdPartyAuthnProvidersToShowMap,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { FlagsServiceHooks } from '../../flags/flags.hooks'
import { platformService } from '../../platform/platform.service'
import { authnSsoSamlService } from '../authentication/saml-authn/authn-sso-saml-service'
import { appearanceService } from '../helper/appearance/appearance-service'

export const enterpriseFlagsHooks: FlagsServiceHooks = {
    async modify(params) {
        const log = params.request.log
        const platformId = resolvePlatformId(params.request)

        // Branding (D.2) always resolves (default theme when no organization context).
        const theme = await appearanceService(log).getThemeForPlatform(platformId)

        const flags: Record<string, unknown> = {
            ...params.flags,
            [IbFlagId.THEME]: theme,
        }

        // Platform-specific authentication configuration is resolved only for an authenticated
        // organization context; otherwise the base auth flags are preserved.
        if (!isNil(platformId)) {
            await applyPlatformAuthFlags(flags, platformId, log)
        }

        return flags
    },
}

// Resolve the caller's platform's auth configuration into the flags map: which third-party
// providers to show, the SAML ACS URL, and the cloud/email/community auth toggles. Best-effort:
// a resolution failure leaves the base flags untouched (the flags read never fails).
async function applyPlatformAuthFlags(
    flags: Record<string, unknown>,
    platformId: string,
    log: FastifyBaseLogger,
): Promise<void> {
    try {
        const platform = await platformService(log).getOneWithPlanOrThrow(platformId)
        const samlConfigured = await platformService(log).hasSamlConfigured(platformId)
        const samlEnabled = platform.plan.ssoEnabled === true && samlConfigured

        const providersToShow: ThirdPartyAuthnProvidersToShowMap = {
            [ThirdPartyAuthnProviderEnum.GOOGLE]: platform.googleAuthEnabled === true,
            [ThirdPartyAuthnProviderEnum.SAML]: samlEnabled,
        }
        flags[IbFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP] = providersToShow

        if (samlEnabled) {
            flags[IbFlagId.SAML_AUTH_ACS_URL] = await authnSsoSamlService(log).getAcsUrl(platformId)
        }

        flags[IbFlagId.CLOUD_AUTH_ENABLED] = platform.cloudAuthEnabled === true
        flags[IbFlagId.EMAIL_AUTH_ENABLED] = platform.emailAuthEnabled === true
    }
    catch (error) {
        log.warn({ error, platformId }, '[enterpriseFlagsHooks] failed to resolve platform auth flags; using base flags')
    }
}

// The organization whose configuration to resolve is the caller's platform. Principals without a
// platform scope (unauthenticated / infrastructure) resolve to null (default theme, base flags).
function resolvePlatformId(request: FastifyRequest): string | null {
    const principal = request.principal
    if (isNil(principal) || principal.type === PrincipalType.UNKNOWN) {
        return null
    }
    const platform = (principal as { platform?: { id?: string } }).platform
    if (isNil(platform) || isNil(platform.id)) {
        return null
    }
    return platform.id
}
