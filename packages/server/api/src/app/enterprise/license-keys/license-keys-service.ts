// Clean-room implementation — license-key activation & entitlement application (capability spec
// G.4.a). A self-hosted enterprise deployment's plan carries a license key; the key resolves (via
// a vendor-hosted license service reached over trusted, SSRF-guarded outbound HTTP) to an
// entitlement document — a per-capability set of feature booleans plus expiry / activation
// metadata. Applying a valid key writes those entitlements onto the organization's plan; an
// expired/removed key downgrades the organization to the free tier. The daily expiry sweep
// re-verifies every licensed organization so entitlements self-heal and expiries are enforced.
//
// The entitlement document field set (LicenseKeyEntity) is the contract the apply step depends on.
import { safeHttp } from '@intelblocks/server-utils'
import {
    IntellisperError,
    IbEdition,
    CreateTrialLicenseKeyRequestBody,
    ErrorCode,
    isNil,
    LicenseKeyEntity,
    PlanName,
    TeamProjectsLimit,
    TelemetryEventName,
} from '@intelblocks/shared'
import { AxiosError } from 'axios'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { telemetry } from '../../helper/telemetry.utils'
import { platformService } from '../../platform/platform.service'
import { platformPlanService } from '../platform/platform-plan/platform-plan.service'

const DEFAULT_LICENSE_KEY_URL = 'https://secrets.activepieces.com'

function licenseKeyBaseUrl(): string {
    return system.get(AppSystemProp.LICENSE_KEY_URL) ?? DEFAULT_LICENSE_KEY_URL
}

// The complete "turned off" entitlement set — every capability boolean false. Written on downgrade
// so no stale paid capability survives an expired/removed license.
const TURNED_OFF_ENTITLEMENTS = {
    ssoEnabled: false,
    scimEnabled: false,
    environmentsEnabled: false,
    embeddingEnabled: false,
    auditLogEnabled: false,
    customAppearanceEnabled: false,
    globalConnectionsEnabled: false,
    customRolesEnabled: false,
    projectRolesEnabled: false,
    apiKeysEnabled: false,
    manageBlocksEnabled: false,
    manageTemplatesEnabled: false,
    secretManagersEnabled: false,
    analyticsEnabled: false,
    eventStreamingEnabled: false,
    agentsEnabled: false,
    aiProvidersEnabled: false,
    chatEnabled: false,
    dataManipulationEnabled: false,
    showPoweredBy: false,
} as const

export const licenseKeysService = (log: FastifyBaseLogger) => ({
    // Issue a trial key: POST the lead to the vendor license service. A 409 (email already has an
    // activation key) is mapped to a distinct error; the issued document is returned.
    async requestTrial(request: CreateTrialLicenseKeyRequestBody): Promise<LicenseKeyEntity> {
        try {
            const response = await safeHttp.retryingAxios.post<LicenseKeyEntity>(
                `${licenseKeyBaseUrl()}/license-keys`,
                request,
            )
            return response.data
        }
        catch (error) {
            if (error instanceof AxiosError && error.response?.status === 409) {
                throw new IntellisperError({
                    code: ErrorCode.EMAIL_ALREADY_HAS_ACTIVATION_KEY,
                    params: { email: request.email },
                })
            }
            throw error
        }
    },

    // Fetch a key's entitlement document. A nil key → null; a 404 → null (unknown key); any other
    // non-OK response is an unexpected error (thrown). No side effects.
    async getKey(key: string | undefined): Promise<LicenseKeyEntity | null> {
        if (isNil(key) || key.trim() === '') {
            return null
        }
        try {
            const response = await safeHttp.retryingAxios.get<LicenseKeyEntity>(
                `${licenseKeyBaseUrl()}/license-keys/${key}`,
            )
            return response.data
        }
        catch (error) {
            if (error instanceof AxiosError && error.response?.status === 404) {
                return null
            }
            log.error({ error }, '[licenseKeysService#getKey] unexpected error fetching license key')
            throw error
        }
    },

    // Mark a key activated on the vendor service (idempotent server-side). Best-effort: 409/404 are
    // tolerated as no-ops, and ANY error is swallowed so activation never blocks the caller. On
    // success with a platformId, fire a best-effort key-activated telemetry signal.
    async markAsActivated({ key, platformId }: { key: string, platformId?: string }): Promise<void> {
        try {
            await safeHttp.retryingAxios.post(`${licenseKeyBaseUrl()}/license-keys/activate`, {
                key,
                ...(isNil(platformId) ? {} : { platformId }),
            })
            if (!isNil(platformId)) {
                await telemetry(log).trackPlatform(platformId, {
                    name: TelemetryEventName.KEY_ACTIVATED,
                    payload: { date: new Date().toISOString(), key },
                }).catch(() => undefined)
            }
        }
        catch (error) {
            if (error instanceof AxiosError && (error.response?.status === 409 || error.response?.status === 404)) {
                return
            }
            log.warn({ error }, '[licenseKeysService#markAsActivated] activation failed (best-effort, swallowed)')
        }
    },

    // Compose-verify: nil license → null; otherwise mark activated (on every verify, idempotent),
    // fetch the document, then apply the expiry check — an expired or missing key → null.
    async verifyKeyOrReturnNull({ platformId, license }: { platformId: string, license: string | undefined }): Promise<LicenseKeyEntity | null> {
        if (isNil(license) || license.trim() === '') {
            return null
        }
        await this.markAsActivated({ key: license, platformId })
        const key = await this.getKey(license)
        if (isNil(key)) {
            return null
        }
        if (new Date(key.expiresAt).getTime() < Date.now()) {
            return null
        }
        return key
    },

    // Extend a trial on the vendor service, gated by an operator secret API key header. A 404 → a
    // not-found error.
    async extendTrial({ email, days }: { email: string, days: number }): Promise<void> {
        const apiKey = system.get(AppSystemProp.LICENSE_KEY_EXTEND_TRIAL_API_KEY)
        try {
            await safeHttp.retryingAxios.post(
                `${licenseKeyBaseUrl()}/license-keys/extend-trial`,
                { email, days },
                { headers: { 'api-key': apiKey ?? '' } },
            )
        }
        catch (error) {
            if (error instanceof AxiosError && error.response?.status === 404) {
                throw new IntellisperError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: { entityType: 'license_key', entityId: email },
                })
            }
            throw error
        }
    },

    // Apply a valid key's entitlements to the organization's plan in one update: every entitlement
    // boolean mapped one-to-one, the recorded license key + expiry, the derived tier and
    // team-projects limit, and cleared commercial/subscription fields (the license is now the
    // source of truth).
    async applyLimits(platformId: string, key: LicenseKeyEntity): Promise<void> {
        const isCloud = system.getEdition() === IbEdition.CLOUD
        const manageProjectsEnabled = readFlag(key, 'manageProjectsEnabled', false)

        await platformPlanService(log).update({
            platformId,
            plan: deriveTier({ key, isCloud }),
            licenseKey: key.key,
            licenseExpiresAt: key.expiresAt,
            teamProjectsLimit: manageProjectsEnabled
                ? TeamProjectsLimit.UNLIMITED
                : (isCloud ? TeamProjectsLimit.ONE : TeamProjectsLimit.NONE),
            ssoEnabled: key.ssoEnabled,
            scimEnabled: key.scimEnabled,
            environmentsEnabled: key.environmentsEnabled,
            embeddingEnabled: key.embeddingEnabled,
            auditLogEnabled: key.auditLogEnabled,
            customAppearanceEnabled: key.customAppearanceEnabled,
            globalConnectionsEnabled: key.globalConnectionsEnabled,
            customRolesEnabled: key.customRolesEnabled,
            projectRolesEnabled: key.projectRolesEnabled,
            apiKeysEnabled: key.apiKeysEnabled,
            manageBlocksEnabled: key.manageBlocksEnabled,
            manageTemplatesEnabled: key.manageTemplatesEnabled,
            secretManagersEnabled: key.secretManagersEnabled,
            analyticsEnabled: key.analyticsEnabled,
            eventStreamingEnabled: key.eventStreamingEnabled,
            agentsEnabled: key.agentsEnabled,
            // Newer, optional entitlements default OFF when absent — EXCEPT aiProviders (defaults ON).
            aiProvidersEnabled: readFlag(key, 'aiProvidersEnabled', true),
            chatEnabled: readFlag(key, 'chatEnabled', false),
            dataManipulationEnabled: readFlag(key, 'dataManipulationEnabled', false),
            showPoweredBy: key.showPoweredBy,
            // Commercial/subscription fields cleared — the license is the source of truth.
            stripeSubscriptionId: undefined,
            stripeSubscriptionStatus: undefined,
            activeFlowsLimit: undefined,
            projectsLimit: undefined,
        })
    },

    // Boot/startup verification: if a license key is configured via env, verify it and apply its
    // limits to the deployment's (oldest) organization — so a self-hosted instance is entitled from
    // startup without an admin having to re-verify. Best-effort: a failure never blocks boot.
    async verifyOnStartup(): Promise<void> {
        const configuredKey = system.get(AppSystemProp.LICENSE_KEY)
        if (isNil(configuredKey) || configuredKey.trim() === '') {
            return
        }
        try {
            const platform = await platformService(log).getOldestPlatform()
            if (isNil(platform)) {
                return
            }
            const verified = await this.verifyKeyOrReturnNull({ platformId: platform.id, license: configuredKey })
            if (isNil(verified)) {
                log.warn('[licenseKeysService#verifyOnStartup] configured license key is invalid or expired; not applied')
                return
            }
            await this.applyLimits(platform.id, verified)
        }
        catch (error) {
            log.error({ error }, '[licenseKeysService#verifyOnStartup] failed to apply configured license key at startup')
        }
    },

    // Downgrade an organization to the free/default tier: write the complete turned-off entitlement
    // set — every capability boolean false — plus clear the license key/expiry and reset the
    // team-projects limit. In this edition every entitlement boolean lives on the plan record (the
    // single source of truth for the organization's capabilities); the write also clears the
    // license key/expiry that only the plan carries. No stale paid capability survives an
    // expired/removed license.
    async downgradeToFreePlan(platformId: string): Promise<void> {
        await platformPlanService(log).update({
            platformId,
            plan: PlanName.STANDARD,
            licenseKey: null,
            licenseExpiresAt: null,
            teamProjectsLimit: TeamProjectsLimit.NONE,
            ...TURNED_OFF_ENTITLEMENTS,
        })
    },
})

// The plan tier for a key: enterprise, but internal for a staff/internal key — one that grants
// neither SSO nor embedding on the managed-cloud edition.
function deriveTier({ key, isCloud }: { key: LicenseKeyEntity, isCloud: boolean }): PlanName {
    const isInternalKey = isCloud && !key.ssoEnabled && !key.embeddingEnabled
    return isInternalKey ? PlanName.INTERNAL : PlanName.ENTERPRISE
}

// Read an optional entitlement flag, defaulting when the document (an older one) omits it.
function readFlag(key: LicenseKeyEntity, field: keyof LicenseKeyEntity, defaultValue: boolean): boolean {
    const value = key[field]
    return typeof value === 'boolean' ? value : defaultValue
}
