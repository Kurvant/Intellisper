import { createHash } from 'node:crypto'
import { FileType, ibId, isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { s3Helper } from '../../file/s3-helper'
import { AgentFileEntity } from '../entities'
import { agentScope } from '../scope/agent-scope'

/**
 * Edit-track file storage for the browser agent. Only EDIT-track files persist (read-track files
 * are stateless — extracted client-side and inlined). Backed by S3 via blockunits' s3Helper, with
 * sha256 content-hash DEDUPE (no duplicate uploads) and versioning on edit. All ops owner-scoped.
 *
 * S3 is required for edit files (a paid capability). When S3 isn't configured the s3Helper throws a
 * clear error, surfaced to the user as "file storage isn't available".
 */
const fileRepo = repoFactory(AgentFileEntity)

export type FileScope = { userId: string, platformId: string }

export const agentFileService = (log: FastifyBaseLogger) => ({
    /**
     * Persist an edit-track file. Dedupe by (user, sha256): if the same bytes already exist for this
     * user, reuse the row (no second S3 PUT). Returns a compact view.
     */
    async persist(scope: FileScope, params: { name: string, mime: string, bytes: Buffer, conversationId?: string }): Promise<{ fileId: string, name: string, mime: string }> {
        const contentHash = createHash('sha256').update(params.bytes).digest('hex')
        const existing = await fileRepo().findOneBy({ ...agentScope.ownerFilter(scope), contentHash })
        if (!isNil(existing) && isNil(existing.deletedAt)) {
            return { fileId: existing.id, name: existing.name, mime: existing.mime }
        }

        const id = ibId()
        const s3Key = await s3Helper(log).constructS3Key(scope.platformId, undefined, FileType.UNKNOWN, id)
        await s3Helper(log).uploadFile(s3Key, params.bytes)
        const row = await fileRepo().save(fileRepo().create({
            id,
            platformId: scope.platformId,
            userId: scope.userId,
            conversationId: params.conversationId ?? null,
            name: params.name,
            mime: params.mime,
            sizeBytes: params.bytes.length,
            contentHash,
            s3Key,
            version: 1,
        }))
        return { fileId: row.id, name: row.name, mime: row.mime }
    },

    /** Owner-scoped metadata read. */
    async getMeta(scope: FileScope, fileId: string) {
        const row = await fileRepo().findOneBy({ id: fileId, ...agentScope.ownerFilter(scope) })
        if (isNil(row) || !isNil(row.deletedAt)) return null
        return row
    },

    /** Fetch the file bytes (owner-scoped). */
    async getBytes(scope: FileScope, fileId: string): Promise<Buffer | null> {
        const meta = await this.getMeta(scope, fileId)
        if (!meta) return null
        return s3Helper(log).getFile(meta.s3Key)
    },

    /**
     * Write a new VERSION of a file (an edit): new S3 object, bumped version, updated hash/size.
     * Returns a presigned download URL for the edited result.
     */
    async writeNewVersion(scope: FileScope, fileId: string, name: string, mime: string, bytes: Buffer): Promise<{ downloadUrl: string, name: string } | null> {
        const meta = await this.getMeta(scope, fileId)
        if (!meta) return null
        const newKey = await s3Helper(log).constructS3Key(scope.platformId, undefined, FileType.UNKNOWN, `${fileId}-v${meta.version + 1}`)
        await s3Helper(log).uploadFile(newKey, bytes)
        const oldKey = meta.s3Key
        await fileRepo().update({ id: fileId }, {
            s3Key: newKey,
            name,
            mime,
            sizeBytes: bytes.length,
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            version: meta.version + 1,
        })
        // Best-effort delete of the superseded object.
        await s3Helper(log).deleteFiles([oldKey]).catch((err) => log.warn({ err: (err as Error).message }, '[agentFile] old-version delete failed'))
        const downloadUrl = await s3Helper(log).getS3SignedUrl(newKey, name)
        return { downloadUrl, name }
    },

    /** Presigned download URL for the current version (owner-scoped). */
    async downloadUrl(scope: FileScope, fileId: string): Promise<{ url: string, name: string } | null> {
        const meta = await this.getMeta(scope, fileId)
        if (!meta) return null
        const url = await s3Helper(log).getS3SignedUrl(meta.s3Key, meta.name)
        return { url, name: meta.name }
    },
})
