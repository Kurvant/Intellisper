// Clean-room implementation — custom embed subdomain service (capability spec D.3). Serves an
// organization's embedded experience under its OWN hostname: register the hostname with the edge
// provider (Cloudflare for SaaS), surface the DNS records the customer must create, and resolve an
// incoming custom hostname back to its owning organization.
//
// One custom hostname per organization (the unique platformId index), one organization per
// hostname (the unique hostname index). A registration starts PENDING_VERIFICATION and becomes
// ACTIVE once the provider reports the hostname and its certificate are live. When the edge
// provider is not configured (self-hosted / dev) registration still records the request but with
// no provider id / records — the embed-security layer then falls back to the env-configured
// origins (the documented fallback).
import {
    EmbedSubdomain,
    EmbedSubdomainStatus,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    PlatformId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { cloudflareClient } from './cloudflare-client'
import { EmbedSubdomainEntity } from './embed-subdomain.entity'

const embedSubdomainRepo = repoFactory(EmbedSubdomainEntity)

export const embedSubdomainService = (log: FastifyBaseLogger) => ({
    // Resolve an incoming custom hostname to its subdomain record (used by the embed-security
    // layer to derive the correct organization's allowed embed origins). Null when unregistered.
    async getByHostname({ hostname }: { hostname: string }): Promise<EmbedSubdomain | null> {
        return embedSubdomainRepo().findOneBy({ hostname })
    },

    // The organization's custom subdomain record, or null when it has not registered one.
    async getByPlatform({ platformId }: { platformId: PlatformId }): Promise<EmbedSubdomain | null> {
        return embedSubdomainRepo().findOneBy({ platformId })
    },

    // Register (or re-register) the organization's custom hostname with the edge provider and
    // persist the pending record plus the DNS records the customer must create. Re-registering
    // replaces the organization's prior record (one hostname per organization). A hostname already
    // claimed by ANOTHER organization is rejected.
    async generate({ platformId, hostname }: { platformId: PlatformId, hostname: string }): Promise<EmbedSubdomain> {
        const normalizedHostname = hostname.toLowerCase().trim()

        const claimedByOther = await embedSubdomainRepo().findOneBy({ hostname: normalizedHostname })
        if (!isNil(claimedByOther) && claimedByOther.platformId !== platformId) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: { message: 'hostname is already registered to another organization' },
            })
        }

        const registration = await cloudflareClient(log).createCustomHostname({ hostname: normalizedHostname })

        const existing = await embedSubdomainRepo().findOneBy({ platformId })
        const saved = await embedSubdomainRepo().save({
            id: existing?.id ?? ibId(),
            platformId,
            hostname: normalizedHostname,
            status: EmbedSubdomainStatus.PENDING_VERIFICATION,
            cloudflareId: registration?.cloudflareId ?? '',
            verificationRecords: registration?.records ?? [],
        })
        return saved
    },

    // Refresh a registration's status from the edge provider: ACTIVE once the hostname and its
    // certificate are both live, otherwise left PENDING_VERIFICATION. A no-op (returns the current
    // record) when the provider is unconfigured or the status cannot be read.
    async verify({ platformId }: { platformId: PlatformId }): Promise<EmbedSubdomain | null> {
        const record = await embedSubdomainRepo().findOneBy({ platformId })
        if (isNil(record) || record.cloudflareId.trim() === '') {
            return record
        }
        const status = await cloudflareClient(log).getCustomHostnameStatus({ cloudflareId: record.cloudflareId })
        if (isNil(status)) {
            return record
        }
        const nextStatus = status.hostnameActive && status.sslActive
            ? EmbedSubdomainStatus.ACTIVE
            : EmbedSubdomainStatus.PENDING_VERIFICATION
        if (nextStatus === record.status) {
            return record
        }
        await embedSubdomainRepo().update({ id: record.id }, { status: nextStatus })
        return { ...record, status: nextStatus }
    },

    // Remove the organization's custom subdomain registration.
    async delete({ platformId }: { platformId: PlatformId }): Promise<void> {
        await embedSubdomainRepo().delete({ platformId })
    },
})
