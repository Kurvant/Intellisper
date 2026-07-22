import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the repo factory + s3Helper so we test dedupe/version logic without a DB or S3.
const findOneByMock = vi.fn()
const saveMock = vi.fn()
const updateMock = vi.fn()
vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({ findOneBy: findOneByMock, save: saveMock, update: updateMock, create: (x: unknown) => x }),
}))

const uploadFileMock = vi.fn()
const getFileMock = vi.fn()
const getSignedUrlMock = vi.fn()
const deleteFilesMock = vi.fn()
const constructKeyMock = vi.fn()
vi.mock('../../../../src/app/file/s3-helper', () => ({
    s3Helper: () => ({
        constructS3Key: constructKeyMock,
        uploadFile: uploadFileMock,
        getFile: getFileMock,
        getS3SignedUrl: getSignedUrlMock,
        deleteFiles: deleteFilesMock,
    }),
}))

import { agentFileService } from '../../../../src/app/browser-agent/files/agent-file.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => agentFileService(log)
const scope = { userId: 'u1', platformId: 'p1' }

beforeEach(() => {
    findOneByMock.mockReset(); saveMock.mockReset(); updateMock.mockReset()
    uploadFileMock.mockReset(); getFileMock.mockReset(); getSignedUrlMock.mockReset(); deleteFilesMock.mockReset(); constructKeyMock.mockReset()
    constructKeyMock.mockResolvedValue('s3/key')
    uploadFileMock.mockResolvedValue('etag')
    getSignedUrlMock.mockResolvedValue('https://signed/url')
    deleteFilesMock.mockResolvedValue(undefined)
})

describe('agentFileService.persist — dedupe by content hash', () => {
    it('reuses an existing row for identical bytes (no second S3 upload)', async () => {
        findOneByMock.mockResolvedValueOnce({ id: 'existing', name: 'a.txt', mime: 'text/plain', deletedAt: null })
        const res = await svc().persist(scope, { name: 'a.txt', mime: 'text/plain', bytes: Buffer.from('hello') })
        expect(res.fileId).toBe('existing')
        expect(uploadFileMock).not.toHaveBeenCalled()
        expect(saveMock).not.toHaveBeenCalled()
    })

    it('uploads + inserts a new row for new bytes, scoped to owner', async () => {
        findOneByMock.mockResolvedValueOnce(null)
        saveMock.mockImplementationOnce(async (row: Record<string, unknown>) => ({ ...row, id: row.id }))
        const res = await svc().persist(scope, { name: 'b.txt', mime: 'text/plain', bytes: Buffer.from('world') })
        expect(uploadFileMock).toHaveBeenCalledTimes(1)
        const saved = saveMock.mock.calls[0][0]
        expect(saved.platformId).toBe('p1')
        expect(saved.userId).toBe('u1')
        expect(saved.version).toBe(1)
        expect(typeof saved.contentHash).toBe('string')
        expect(res.name).toBe('b.txt')
    })
})

describe('agentFileService.writeNewVersion — versioning + owner scope', () => {
    it('bumps the version, uploads a new object, deletes the old, returns a presigned url', async () => {
        findOneByMock.mockResolvedValueOnce({ id: 'f1', name: 'doc.txt', mime: 'text/plain', s3Key: 'old/key', version: 1, deletedAt: null })
        const res = await svc().writeNewVersion(scope, 'f1', 'doc (edited).txt', 'text/plain', Buffer.from('new'))
        expect(uploadFileMock).toHaveBeenCalledTimes(1)
        const update = updateMock.mock.calls[0][1]
        expect(update.version).toBe(2)
        expect(update.s3Key).not.toBe('old/key')
        expect(deleteFilesMock).toHaveBeenCalledWith(['old/key'])
        expect(res?.downloadUrl).toBe('https://signed/url')
    })

    it('returns null when the file is not owned by the caller', async () => {
        findOneByMock.mockResolvedValueOnce(null)
        expect(await svc().writeNewVersion(scope, 'f1', 'x', 'text/plain', Buffer.from('n'))).toBeNull()
    })
})

describe('agentFileService — owner-scoped reads', () => {
    it('getMeta scopes by platform + user and hides soft-deleted', async () => {
        findOneByMock.mockResolvedValueOnce({ id: 'f1', deletedAt: new Date().toISOString() })
        expect(await svc().getMeta(scope, 'f1')).toBeNull()
        expect(findOneByMock.mock.calls[0][0]).toMatchObject({ id: 'f1', platformId: 'p1', userId: 'u1' })
    })
})
