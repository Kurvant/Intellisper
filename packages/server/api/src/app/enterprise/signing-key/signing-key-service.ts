// Clean-room implementation — token-signing key management (capability spec D.1). An
// organization's asymmetric key pairs used to sign tokens for embedding and managed-auth
// handshakes: the host signs a short-lived token with the private key, the platform verifies it
// with the stored public key.
//
// Integrity guarantee: on generation the PRIVATE key is returned to the caller exactly once and
// NEVER stored — only the public key, display name, algorithm, and owning-organization
// reference are persisted (the platform holds no private-key copy to protect). Rotation is
// realized by coexisting keys addressed by id; verification selects the key named by the
// token's `kid`, so old and new keys validate side by side during a rollover. All reads/deletes
// are tenant-scoped.
import { generateKeyPairSync } from 'node:crypto'
import {
    IntellisperError,
    AddSigningKeyResponse,
    ibId,
    ErrorCode,
    isNil,
    KeyAlgorithm,
    PlatformId,
    SeekPage,
    SigningKey,
    SigningKeyId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { JwtSignAlgorithm, jwtUtils } from '../../helper/jwt-utils'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { SigningKeyEntity } from './signing-key-entity'

const signingKeyRepo = repoFactory(SigningKeyEntity)

// RSA with a 4096-bit modulus, PEM-encoded (spec D.1 baseline).
const RSA_MODULUS_LENGTH = 4096

function generateRsaKeyPair(): { publicKey: string, privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: RSA_MODULUS_LENGTH,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    return { publicKey, privateKey }
}

export const signingKeyService = (log: FastifyBaseLogger) => ({

    // Generate a new key pair for an organization. Persists only the public material and returns
    // the private key ONCE (it is never stored). The caller is solely responsible for retaining
    // the private key; a lost key is replaced by issuing another (rotation).
    async add({ platformId, displayName }: AddParams): Promise<AddSigningKeyResponse> {
        const { publicKey, privateKey } = generateRsaKeyPair()
        const saved = await signingKeyRepo().save({
            id: ibId(),
            platformId,
            publicKey,
            displayName,
            algorithm: KeyAlgorithm.RSA,
        })
        log.info({ signingKeyId: saved.id, platformId }, '[signingKeyService] signing key created')
        return {
            ...saved,
            privateKey,
        }
    },

    // List an organization's signing keys — public material and metadata only, never a private
    // key (the platform holds none). Strictly tenant-scoped to the platform.
    async list({ platformId }: { platformId: PlatformId }): Promise<SeekPage<SigningKey>> {
        const keys = await signingKeyRepo().findBy({ platformId })
        return paginationHelper.createPage(keys, null)
    },

    // Resolve a key by id, scoped to the owning organization. A key of another organization
    // surfaces as not-found (never leaks cross-tenant existence).
    async getOneOrThrow({ id, platformId }: KeyRef): Promise<SigningKey> {
        const key = await signingKeyRepo().findOneBy({ id, platformId })
        if (isNil(key)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'signing_key', entityId: id },
            })
        }
        return key
    },

    async delete({ id, platformId }: KeyRef): Promise<void> {
        await this.getOneOrThrow({ id, platformId })
        await signingKeyRepo().delete({ id, platformId })
    },

    // Verification protocol (spec D.1 `kid` lookup). Extract the signing-key id from the token
    // header; if absent or not resolvable to a stored key for the organization, reject with an
    // invalid-token error; otherwise verify the token's signature against that key's public
    // material using its recorded algorithm. A missing kid, an unknown kid, and a signature
    // failure ALL fail closed (throw) — no principal is established on failure.
    async verifyToken<T>({ platformId, token, audience }: VerifyTokenParams): Promise<T> {
        const decoded = jwtUtils.decode<T>({ jwt: token })
        const kid = decoded?.header?.kid
        if (isNil(kid) || kid.trim() === '') {
            throw invalidToken('Signing key id (kid) is missing from the token header')
        }
        const key = await signingKeyRepo().findOneBy({ id: kid, platformId })
        if (isNil(key)) {
            throw invalidToken('The token references an unknown signing key for this organization')
        }
        try {
            return await jwtUtils.decodeAndVerify<T>({
                jwt: token,
                key: key.publicKey,
                algorithm: algorithmToJwtAlgorithm(key.algorithm),
                issuer: null,
                audience,
            })
        }
        catch (error) {
            log.warn({ error, signingKeyId: kid, platformId }, '[signingKeyService] token verification failed')
            throw invalidToken('The token signature could not be verified')
        }
    },

    // Canonical D.1 handshake for embedding / managed-auth (B.6, B.4). Like `verifyToken`, but:
    //   - the organization scope is OPTIONAL — a host-signed embed/managed token carries no
    //     platform id, so the key is resolved by `kid` ALONE and the platform is DERIVED from the
    //     resolved key (pass `platformId` only when the caller already knows the organization and
    //     wants the lookup constrained to it);
    //   - it returns BOTH the resolved key (so the caller can read its `platformId`) and the
    //     verified payload.
    // Failure modes are distinguished so callers can map them to their own contract: an unknown
    // `kid` throws ENTITY_NOT_FOUND (carrying the kid), a missing kid or a bad signature throws
    // INVALID_BEARER_TOKEN. No principal/platform is established on any failure (fail-closed).
    async resolveAndVerify<T>({ token, platformId }: ResolveAndVerifyParams): Promise<{ signingKey: SigningKey, payload: T }> {
        const decoded = jwtUtils.decode<T>({ jwt: token })
        const kid = decoded?.header?.kid
        if (isNil(kid) || kid.trim() === '') {
            throw invalidToken('Signing key id (kid) is missing from the token header')
        }
        const signingKey = await signingKeyRepo().findOneBy({
            id: kid,
            ...(isNil(platformId) ? {} : { platformId }),
        })
        if (isNil(signingKey)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'signing_key', entityId: kid },
            })
        }
        try {
            const payload = await jwtUtils.decodeAndVerify<T>({
                jwt: token,
                key: signingKey.publicKey,
                algorithm: algorithmToJwtAlgorithm(signingKey.algorithm),
                issuer: null,
            })
            return { signingKey, payload }
        }
        catch (error) {
            log.warn({ error, signingKeyId: kid }, '[signingKeyService] token verification failed')
            throw invalidToken('The token signature could not be verified')
        }
    },
})

function invalidToken(message: string): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.INVALID_BEARER_TOKEN,
        params: { message },
    })
}

// Map a stored key algorithm to the JWT signature algorithm used for verification. RSA keys are
// verified with RS256 (RSASSA-PKCS1-v1_5 + SHA-256), the standard for host-signed embed tokens.
function algorithmToJwtAlgorithm(algorithm: KeyAlgorithm): JwtSignAlgorithm {
    switch (algorithm) {
        case KeyAlgorithm.RSA:
            return JwtSignAlgorithm.RS256
    }
}

type AddParams = {
    platformId: PlatformId
    displayName: string
}

type KeyRef = {
    id: SigningKeyId
    platformId: PlatformId
}

type VerifyTokenParams = {
    platformId: PlatformId
    token: string
    audience?: string
}

type ResolveAndVerifyParams = {
    token: string
    // Optional: constrain the key lookup to an organization. Omitted for host-signed embed /
    // managed tokens, whose platform is derived from the resolved key.
    platformId?: PlatformId
}
