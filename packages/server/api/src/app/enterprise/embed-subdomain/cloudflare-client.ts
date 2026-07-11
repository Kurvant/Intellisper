// Clean-room implementation — CDN custom-hostname integration (capability spec D.3). Registers a
// customer's custom hostname with the edge provider (Cloudflare for SaaS "Custom Hostnames") over
// its PUBLIC API and translates the provider's response into the DNS records the customer must add
// to prove ownership and terminate TLS.
//
// All egress uses the SSRF-guarded `safeHttp` client (safe-http rule). The integration is
// OPTIONAL: when the Cloudflare environment is not configured (self-hosted / dev), the client is
// unavailable and the caller degrades to a records-less pending registration rather than failing.
import { safeHttp } from '@intelblocks/server-utils'
import {
    IntellisperError,
    EmbedVerificationRecord,
    EmbedVerificationRecordPurpose,
    EmbedVerificationRecordType,
    ErrorCode,
    isNil,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

const DEFAULT_API_BASE = 'https://api.cloudflare.com/client/v4'

type CloudflareConfig = {
    apiBase: string
    apiToken: string
    zoneId: string
    fallbackOrigin: string
}

// Resolve the Cloudflare configuration, or null when the integration is not configured. The API
// token and zone id are required; the API base and fallback origin have sensible defaults.
function resolveConfig(): CloudflareConfig | null {
    const apiToken = system.get(AppSystemProp.CLOUDFLARE_API_TOKEN)
    const zoneId = system.get(AppSystemProp.CLOUDFLARE_ZONE_ID)
    if (isNil(apiToken) || apiToken.trim() === '' || isNil(zoneId) || zoneId.trim() === '') {
        return null
    }
    return {
        apiBase: system.get(AppSystemProp.CLOUDFLARE_API_BASE) ?? DEFAULT_API_BASE,
        apiToken,
        zoneId,
        fallbackOrigin: system.get(AppSystemProp.CLOUDFLARE_SAAS_FALLBACK_ORIGIN) ?? '',
    }
}

// The provider's custom-hostname response (only the fields this integration consumes).
type CustomHostnameResult = {
    id: string
    status?: string
    ownership_verification?: { type?: string, name?: string, value?: string }
    ownership_verification_http?: { http_url?: string, http_body?: string }
    ssl?: {
        status?: string
        validation_records?: { txt_name?: string, txt_value?: string, cname_target?: string, cname?: string }[]
    }
}

type CloudflareResponse<T> = {
    success: boolean
    errors?: { code?: number, message?: string }[]
    result?: T
}

export const cloudflareClient = (log: FastifyBaseLogger) => ({
    // Whether the edge-provider integration is configured for this deployment.
    isConfigured(): boolean {
        return !isNil(resolveConfig())
    },

    // Register a custom hostname and return the provider id plus the DNS records the customer must
    // create: a CNAME pointing their hostname at the SaaS fallback origin, and the provider's
    // ownership + SSL (DCV) validation records. Returns null when the integration is unconfigured.
    async createCustomHostname({ hostname }: { hostname: string }): Promise<{ cloudflareId: string, records: EmbedVerificationRecord[] } | null> {
        const config = resolveConfig()
        if (isNil(config)) {
            return null
        }
        try {
            const response = await safeHttp.retryingAxios.request<CloudflareResponse<CustomHostnameResult>>({
                url: `${config.apiBase}/zones/${config.zoneId}/custom_hostnames`,
                method: 'POST',
                headers: {
                    authorization: `Bearer ${config.apiToken}`,
                    'content-type': 'application/json',
                },
                data: {
                    hostname,
                    ssl: {
                        method: 'txt',
                        type: 'dv',
                        settings: { min_tls_version: '1.2' },
                    },
                },
            })
            const result = response.data?.result
            if (response.data?.success !== true || isNil(result)) {
                throw new Error(response.data?.errors?.[0]?.message ?? 'Cloudflare custom hostname registration failed')
            }
            return {
                cloudflareId: result.id,
                records: buildVerificationRecords(hostname, config.fallbackOrigin, result),
            }
        }
        catch (error) {
            log.warn({ error, hostname }, '[cloudflareClient] custom hostname registration failed')
            throw new IntellisperError({
                code: ErrorCode.INVALID_CLOUD_CLAIM,
                params: { blockName: 'embed-subdomain' },
            })
        }
    },

    // Fetch a custom hostname's current provider status (for verification refresh). Returns null
    // when unconfigured or unknown.
    async getCustomHostnameStatus({ cloudflareId }: { cloudflareId: string }): Promise<{ hostnameActive: boolean, sslActive: boolean } | null> {
        const config = resolveConfig()
        if (isNil(config)) {
            return null
        }
        try {
            const response = await safeHttp.retryingAxios.request<CloudflareResponse<CustomHostnameResult>>({
                url: `${config.apiBase}/zones/${config.zoneId}/custom_hostnames/${cloudflareId}`,
                method: 'GET',
                headers: { authorization: `Bearer ${config.apiToken}` },
            })
            const result = response.data?.result
            if (response.data?.success !== true || isNil(result)) {
                return null
            }
            return {
                hostnameActive: result.status === 'active',
                sslActive: result.ssl?.status === 'active',
            }
        }
        catch (error) {
            log.warn({ error, cloudflareId }, '[cloudflareClient] custom hostname status fetch failed')
            return null
        }
    },
})

// Translate the provider response into the customer-facing DNS records: the routing CNAME (their
// hostname → the SaaS fallback origin), the ownership TXT, and the SSL DCV TXT.
function buildVerificationRecords(hostname: string, fallbackOrigin: string, result: CustomHostnameResult): EmbedVerificationRecord[] {
    const records: EmbedVerificationRecord[] = []

    if (fallbackOrigin.trim() !== '') {
        records.push({
            type: EmbedVerificationRecordType.CNAME,
            name: hostname,
            value: fallbackOrigin,
            purpose: EmbedVerificationRecordPurpose.HOSTNAME,
        })
    }

    const ownership = result.ownership_verification
    if (!isNil(ownership?.name) && !isNil(ownership?.value)) {
        records.push({
            type: EmbedVerificationRecordType.TXT,
            name: ownership.name,
            value: ownership.value,
            purpose: EmbedVerificationRecordPurpose.OWNERSHIP,
        })
    }

    for (const ssl of result.ssl?.validation_records ?? []) {
        if (!isNil(ssl.txt_name) && !isNil(ssl.txt_value)) {
            records.push({
                type: EmbedVerificationRecordType.TXT,
                name: ssl.txt_name,
                value: ssl.txt_value,
                purpose: EmbedVerificationRecordPurpose.SSL,
            })
        }
    }

    return records
}
