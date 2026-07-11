// Clean-room implementation — external-token extractor for managed authentication (capability
// spec B.4 / embedding). An embedded host mints a short JWT describing the end-user and workspace
// and signs it with a platform signing key's PRIVATE half (D.1). This module turns that token
// into the trusted principal the provisioning flow acts on.
//
// The signature verification is delegated to the D.1 signing-key service's canonical handshake
// (`resolveAndVerify`) — the SINGLE seam that resolves a token's `kid` to a stored key and checks
// its signature — so there is one verification code path shared by every embed/managed consumer.
// Here the platform is DERIVED from the resolved key (the embed token carries none), and an
// unknown `kid` is surfaced as an AUTHENTICATION failure (401) with the message contract managed
// auth exposes; a bad embed token is an authentication failure, not a not-found.
import { IntellisperError, ErrorCode, BlocksFilterType, PlatformId } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { jwtUtils } from '../../../helper/jwt-utils'
import { signingKeyService } from '../../signing-key/signing-key-service'

// The optional per-workspace block availability filter an embed token may carry: an allow-list of
// block TAGS (resolved to block names during provisioning).
export type ExternalTokenBlocksFilter = {
    filterType: BlocksFilterType
    tags: string[]
}

// The claims an embed token carries. `role` is the project role granted to the user in the
// (possibly newly created) workspace. `blocks` and the concurrency-pool fields are optional
// provisioning directives.
export type ExternalTokenPayload = {
    externalUserId: string
    externalProjectId: string
    firstName: string
    lastName: string
    role: string
    blocks?: ExternalTokenBlocksFilter
    concurrencyPoolKey?: string
    concurrencyPoolLimit?: number
}

// The verified principal: the token claims plus the platform derived from the signing key that
// validated the token.
export type ExternalPrincipal = ExternalTokenPayload & {
    platformId: PlatformId
}

export const externalTokenExtractor = (log: FastifyBaseLogger) => ({
    // Verify an external access token and return the trusted principal. Rejects (401) a token
    // whose `kid` references no signing key, or whose signature does not verify against that key.
    async extract(token: string): Promise<ExternalPrincipal> {
        const { signingKey, payload } = await resolveAndVerify(log, token)
        return {
            platformId: signingKey.platformId,
            externalUserId: payload.externalUserId,
            externalProjectId: payload.externalProjectId,
            firstName: payload.firstName,
            lastName: payload.lastName,
            role: payload.role,
            blocks: payload.blocks,
            concurrencyPoolKey: payload.concurrencyPoolKey,
            concurrencyPoolLimit: payload.concurrencyPoolLimit,
        }
    },
})

// Delegate to the D.1 handshake (kid → stored key → signature check), mapping its failure modes to
// managed-auth's authentication contract: an unknown key becomes the `signing key not found …`
// authentication error; every other failure (missing kid, bad signature) is a generic invalid
// external token. Both are AUTHENTICATION (401) — never a not-found leaked to the caller.
async function resolveAndVerify(
    log: FastifyBaseLogger,
    token: string,
): Promise<{ signingKey: { platformId: PlatformId }, payload: ExternalTokenPayload }> {
    try {
        return await signingKeyService(log).resolveAndVerify<ExternalTokenPayload>({ token })
    }
    catch (error) {
        if (error instanceof IntellisperError && error.error.code === ErrorCode.ENTITY_NOT_FOUND) {
            const signingKeyId = decodeSigningKeyId(token)
            throw new IntellisperError({
                code: ErrorCode.AUTHENTICATION,
                params: { message: `signing key not found signingKeyId=${signingKeyId}` },
            })
        }
        throw new IntellisperError({
            code: ErrorCode.AUTHENTICATION,
            params: { message: 'invalid external access token' },
        })
    }
}

// The signing-key id carried in the token's `kid` header, used to render the not-found message.
function decodeSigningKeyId(token: string): string {
    const decoded = jwtUtils.decode<ExternalTokenPayload>({ jwt: token })
    return decoded?.header?.kid ?? ''
}
