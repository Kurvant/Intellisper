// Clean-room implementation — connection signing keys (capability spec E.4, keypair half).
//
// A connection key is a per-workspace RSA keypair used by an embedded host to sign the tokens
// that later provision end-user connections (the token-provisioning half is deferred with
// app-credentials; see the module). This service owns the keypair lifecycle:
//   - create: mint a fresh RSA keypair; persist ONLY the public half in the workspace's
//     `connection_key` row; return the private half to the caller EXACTLY ONCE (it is never
//     stored, mirroring the signing-key D.1 guarantee, but scoped to a workspace rather than an
//     organization).
//   - list / delete: workspace-scoped management of the stored public keys.
//
// Every operation is workspace-scoped; the module's project security guard rejects cross-project
// access. Despite the historical name `upsert`, each call MINTS A NEW key row (insert-per-call).
import { generateKeyPairSync } from 'node:crypto'
import {
    ibId,
    ConnectionKey,
    ConnectionKeyType,
    Cursor,
    SeekPage,
    UpsertSigningKeyConnection,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { ConnectionKeyEntity } from './connection-key.entity'

const connectionKeyRepo = repoFactory(ConnectionKeyEntity)

// RSA with a 4096-bit modulus, PEM-encoded (matches the signing-key D.1 baseline).
const RSA_MODULUS_LENGTH = 4096

function generateRsaKeyPair(): { publicKey: string, privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: RSA_MODULUS_LENGTH,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    return { publicKey, privateKey }
}

export const connectionKeyService = (_log: FastifyBaseLogger) => ({
    // Mint a new workspace signing key. Persists the public half only; returns the record with
    // the private half set THIS ONCE (the caller must capture it — it can never be retrieved
    // again). Insert-per-call: each invocation creates a distinct key row.
    async upsert({ projectId, request: _request }: { projectId: string, request: UpsertSigningKeyConnection }): Promise<ConnectionKey> {
        const { publicKey, privateKey } = generateRsaKeyPair()
        const saved = await connectionKeyRepo().save({
            id: ibId(),
            projectId,
            settings: {
                type: ConnectionKeyType.SIGNING_KEY,
                publicKey,
            },
        })
        // Return the private key exactly once; it is NOT part of the persisted row.
        return {
            ...saved,
            settings: {
                ...saved.settings,
                privateKey,
            },
        }
    },

    // List a workspace's connection keys (public material only — the private key was never
    // stored), cursor paginated and strictly workspace-scoped.
    async list({ projectId, cursor, limit }: { projectId: string, cursor: Cursor | null, limit: number }): Promise<SeekPage<ConnectionKey>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const paginator = buildPaginator({
            entity: ConnectionKeyEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = connectionKeyRepo()
            .createQueryBuilder('connection_key')
            .where('connection_key."projectId" = :projectId', { projectId })
        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        return paginationHelper.createPage(data, nextCursor)
    },

    // Delete a connection key by id. The module's TABLE project guard has already verified the
    // key belongs to the caller's workspace before this runs.
    async delete({ id }: { id: string }): Promise<void> {
        await connectionKeyRepo().delete({ id })
    },

    // The PUBLIC keys registered for a workspace — the material a signed provisioning token is
    // verified against (the token-provisioning flow tries each until one validates). Server-side
    // only; the private halves were never stored.
    async listPublicKeysByProject({ projectId }: { projectId: string }): Promise<string[]> {
        const keys = await connectionKeyRepo().findBy({ projectId })
        return keys.map((key) => key.settings.publicKey)
    },
})
