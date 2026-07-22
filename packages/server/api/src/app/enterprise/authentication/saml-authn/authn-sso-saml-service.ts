// Clean-room implementation — SAML SSO orchestration (capability spec B.3).
// Ties together: starting an IdP login (build redirect), consuming the IdP's assertion
// (parse → resolve identity → federated sign-in), IdP-initiated domain discovery (map a
// user's email domain to the platform that owns it), and administering a platform's SSO
// domain (claim it, prove ownership via a DNS TXT record, expire unproven claims).
import { resolveTxt } from 'node:dns/promises'
import {
    AuthenticationResponse,
    ErrorCode,
    IbEdition,
    ibId,
    IntellisperError,
    isNil,
    PlatformId,
    SAMLAuthnProviderConfig,
    SsoDomainVerification,
    SsoDomainVerificationRecordType,
    SsoDomainVerificationStatus,
    tryCatch,
    UserIdentityProvider,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { authenticationService } from '../../../authentication/authentication.service'
import { domainHelper } from '../../../helper/domain-helper'
import { system } from '../../../helper/system/system'
import { platformRepo, platformService } from '../../../platform/platform.service'
import { platformUtils } from '../../../platform/platform.utils'
import { platformPlanService } from '../../platform/platform-plan/platform-plan.service'
import { createSamlClient, IdpLoginResponse } from './saml-client'

// A claimed-but-unverified domain that is never proven is released after this long, so a
// mistyped or abandoned claim does not block another platform from taking it.
const PENDING_DOMAIN_TTL_HOURS = 3
const VERIFY_RECORD_NAME_PREFIX = '_intellisper-verify'
const VERIFY_RECORD_VALUE_PREFIX = 'intellisper-verify'

export const authnSsoSamlService = (log: FastifyBaseLogger) => ({

    // The Assertion Consumer Service URL the IdP must post the assertion back to. On cloud
    // a platform may still be on a legacy custom domain (whose SAML config points there);
    // otherwise the shared ACS carries the platform id so the callback can be routed.
    async getAcsUrl(platformId: string): Promise<string> {
        const baseUrl = await domainHelper.getPublicApiUrl({ path: '/v1/authn/saml/acs' })
        if (system.getEdition() === IbEdition.CLOUD) {
            const legacyHost = await platformUtils.getLegacyHostByPlatformId(platformId)
            if (!isNil(legacyHost)) {
                return `https://${legacyHost}/api/v1/authn/saml/acs`
            }
            return `${baseUrl}?platformId=${encodeURIComponent(platformId)}`
        }
        return baseUrl
    },

    // Load a platform's SAML provider config, or fail clearly if the platform has no SAML
    // configured — callers turn this into a 4xx rather than a 500.
    async getSamlConfigOrThrow(platformId: string | null): Promise<{ saml: SAMLAuthnProviderConfig, platformId: string }> {
        if (isNil(platformId)) {
            throw validationError('Platform ID is required for SAML authentication')
        }
        const platform = await platformService(log).getOneWithFederatedAuthOrThrow(platformId)
        const saml = platform.federatedAuthProviders.saml
        if (isNil(saml)) {
            throw validationError('SAML is not configured for this platform')
        }
        return { saml, platformId }
    },

    // Begin an SP-initiated login: return the IdP URL the browser should be redirected to.
    async login(platformId: string, samlProvider: SAMLAuthnProviderConfig): Promise<{ redirectUrl: string }> {
        const acsUrl = await this.getAcsUrl(platformId)
        const client = await createSamlClient({ platformId, samlProvider, acsUrl })
        return { redirectUrl: client.getLoginUrl() }
    },

    // Consume the IdP's assertion: validate it, resolve the identity attributes, and turn
    // them into an authenticated session via the shared federated sign-in path (scoped to
    // this platform).
    async acs(platformId: string, samlProvider: SAMLAuthnProviderConfig, idpLoginResponse: IdpLoginResponse): Promise<AuthenticationResponse> {
        const acsUrl = await this.getAcsUrl(platformId)
        const client = await createSamlClient({ platformId, samlProvider, acsUrl })
        const attributes = await client.parseAndValidateLoginResponse(idpLoginResponse)
        return authenticationService(log).federatedAuthn({
            email: attributes.email,
            firstName: attributes.firstName,
            lastName: attributes.lastName,
            newsLetter: false,
            trackEvents: true,
            provider: UserIdentityProvider.SAML,
            predefinedPlatformId: platformId,
        })
    },

    // Map an email domain to the platform that owns it, for IdP discovery on the login
    // screen. Returns a platform id only when the domain is claimed AND proven AND the
    // platform has SSO licensed AND SAML actually configured — any gap yields null so the
    // caller falls back to password login instead of a broken SSO redirect.
    async discoverByDomain(domain: string): Promise<{ platformId: string | null }> {
        const ssoDomain = domain.trim().toLowerCase()
        if (ssoDomain.length === 0) {
            return { platformId: null }
        }
        const platform = await platformRepo().findOneBy({ ssoDomain })
        if (isNil(platform)) {
            return { platformId: null }
        }
        if (platform.ssoDomainVerification?.status !== SsoDomainVerificationStatus.VERIFIED) {
            return { platformId: null }
        }
        const plan = await platformPlanService(log).getOrCreateForPlatform(platform.id)
        if (!plan.ssoEnabled) {
            return { platformId: null }
        }
        const samlConfigured = await platformService(log).hasSamlConfigured(platform.id)
        if (!samlConfigured) {
            return { platformId: null }
        }
        return { platformId: platform.id }
    },

    // Claim (or clear) a platform's SSO domain. A new domain is validated, checked for
    // uniqueness across platforms, and issued a fresh pending TXT-record challenge; an
    // unchanged domain keeps its existing challenge; a null clears the claim.
    async updateSsoDomain({ platformId, ssoDomain }: { platformId: PlatformId, ssoDomain: string | null }): Promise<SsoDomainState> {
        const normalized = ssoDomain?.trim().toLowerCase() ?? null
        const nextDomain = !isNil(normalized) && normalized.length > 0 ? normalized : null

        if (!isNil(nextDomain)) {
            // A DNS hostname: dot-separated labels of [a-z0-9-] (not starting/ending with a hyphen),
            // at least two labels (must contain a dot). Zod 4 dropped the v3 `.hostname()` helper, so
            // this is validated explicitly and identically.
            const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
            if (!HOSTNAME_RE.test(nextDomain)) {
                throw validationError('SSO domain must be a valid lowercase domain (e.g. acme.com)')
            }
            const owner = await platformRepo().findOneBy({ ssoDomain: nextDomain })
            if (!isNil(owner) && owner.id !== platformId) {
                throw validationError('This SSO domain is already in use')
            }
        }

        const current = await platformService(log).getOneOrThrow(platformId)
        const verification = nextVerification({
            nextDomain,
            currentDomain: current.ssoDomain ?? null,
            currentVerification: current.ssoDomainVerification ?? null,
        })
        await platformService(log).update({ id: platformId, ssoDomain: nextDomain, ssoDomainVerification: verification })
        return { ssoDomain: nextDomain, ssoDomainVerification: verification }
    },

    // Attempt to prove a pending domain claim by looking up its TXT record. Idempotent: an
    // already-verified domain is returned unchanged, and a failed lookup leaves the claim
    // pending rather than erroring.
    async verifySsoDomain({ platformId }: { platformId: PlatformId }): Promise<SsoDomainState> {
        const platform = await platformService(log).getOneOrThrow(platformId)
        if (isNil(platform.ssoDomain) || isNil(platform.ssoDomainVerification)) {
            throw validationError('No SSO domain configured for this platform')
        }
        if (platform.ssoDomainVerification.status === SsoDomainVerificationStatus.VERIFIED) {
            return { ssoDomain: platform.ssoDomain, ssoDomainVerification: platform.ssoDomainVerification }
        }

        const proven = await txtRecordMatches({
            name: platform.ssoDomainVerification.record.name,
            expected: platform.ssoDomainVerification.record.value,
            log,
        })
        if (!proven) {
            return { ssoDomain: platform.ssoDomain, ssoDomainVerification: platform.ssoDomainVerification }
        }

        const verified: SsoDomainVerification = {
            ...platform.ssoDomainVerification,
            status: SsoDomainVerificationStatus.VERIFIED,
        }
        const updated = await platformService(log).update({ id: platformId, ssoDomainVerification: verified })
        return { ssoDomain: updated.ssoDomain ?? null, ssoDomainVerification: updated.ssoDomainVerification ?? null }
    },

    // Release domain claims that have stayed pending past the TTL (invoked on a schedule).
    async expirePendingSsoDomains(): Promise<void> {
        const result = await platformRepo()
            .createQueryBuilder()
            .update()
            .set({ ssoDomain: null, ssoDomainVerification: null })
            .where('"ssoDomain" IS NOT NULL')
            .andWhere('"ssoDomainVerification"->>\'status\' = :status', { status: SsoDomainVerificationStatus.PENDING_VERIFICATION })
            .andWhere(`("ssoDomainVerification"->>'createdAt')::timestamptz < NOW() - INTERVAL '${PENDING_DOMAIN_TTL_HOURS} hour'`)
            .execute()
        const affected = result.affected ?? 0
        if (affected > 0) {
            log.info({ affected }, 'Released pending SSO domain claims past TTL')
        }
    },
})

type SsoDomainState = {
    ssoDomain: string | null
    ssoDomainVerification: SsoDomainVerification | null
}

// Decide the verification state that accompanies a domain change: none when the domain is
// cleared, the existing challenge when the domain is unchanged, otherwise a fresh pending
// TXT challenge with a random token.
function nextVerification({ nextDomain, currentDomain, currentVerification }: {
    nextDomain: string | null
    currentDomain: string | null
    currentVerification: SsoDomainVerification | null
}): SsoDomainVerification | null {
    if (isNil(nextDomain)) {
        return null
    }
    if (nextDomain === currentDomain && !isNil(currentVerification)) {
        return currentVerification
    }
    return {
        status: SsoDomainVerificationStatus.PENDING_VERIFICATION,
        record: {
            type: SsoDomainVerificationRecordType.TXT,
            name: `${VERIFY_RECORD_NAME_PREFIX}.${nextDomain}`,
            value: `${VERIFY_RECORD_VALUE_PREFIX}=${ibId()}`,
        },
        createdAt: new Date().toISOString(),
    }
}

// A TXT lookup that treats any DNS failure as "not yet proven" rather than an error, and
// matches the expected token against the (possibly multi-chunk) record values.
async function txtRecordMatches({ name, expected, log }: { name: string, expected: string, log: FastifyBaseLogger }): Promise<boolean> {
    const lookup = await tryCatch(() => resolveTxt(name))
    if (lookup.error !== null) {
        log.warn({ name, error: lookup.error }, 'TXT lookup failed during SSO domain verification')
        return false
    }
    return lookup.data.some((chunks) => chunks.join('').trim() === expected)
}

function validationError(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.VALIDATION, params: { message } })
}
