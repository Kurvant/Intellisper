import { BlockType } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bulkDelete = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../src/app/helper/system/system', () => ({
    system: {
        get: vi.fn(() => undefined),
        getEdition: vi.fn(() => 'ce'),
    },
}))

vi.mock('../../../../src/app/pieces/metadata/piece-metadata-service', () => ({
    blockMetadataService: vi.fn(() => ({ bulkDelete })),
    blockRepos: vi.fn(),
}))

vi.mock('../../../../src/app/pieces/metadata/piece-cache', () => ({
    blockCache: vi.fn(() => ({ invalidate: vi.fn() })),
}))

vi.mock('../../../../src/app/helper/system-jobs/system-job', () => ({ systemJobsSchedule: vi.fn() }))
vi.mock('../../../../src/app/helper/system-jobs/job-handlers', () => ({ systemJobHandlers: { registerJobHandler: vi.fn() } }))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never

const officialBlock = (name: string, version: string) => ({ name, version, blockType: BlockType.OFFICIAL })

describe('deleteBlocksIfNotOnCloud', () => {
    beforeEach(() => {
        bulkDelete.mockClear()
    })

    it('deletes nothing when the registry returns an empty list', async () => {
        const { deleteBlocksIfNotOnCloud } = await import('../../../../src/app/pieces/piece-sync-service')

        const deleted = await deleteBlocksIfNotOnCloud(
            [officialBlock('@intelblocks/block-slack', '1.0.0'), officialBlock('@intelblocks/block-gmail', '1.0.0')],
            [],
            log,
        )

        expect(deleted).toBe(0)
        expect(bulkDelete).not.toHaveBeenCalled()
    })

    it('prunes only the official blocks the registry no longer advertises', async () => {
        const { deleteBlocksIfNotOnCloud } = await import('../../../../src/app/pieces/piece-sync-service')

        const deleted = await deleteBlocksIfNotOnCloud(
            [officialBlock('@intelblocks/block-slack', '1.0.0'), officialBlock('@intelblocks/block-gmail', '1.0.0')],
            [{ name: '@intelblocks/block-slack', version: '1.0.0' }],
            log,
        )

        expect(deleted).toBe(1)
        expect(bulkDelete).toHaveBeenCalledWith([{ name: '@intelblocks/block-gmail', version: '1.0.0' }])
    })

    it('never prunes custom blocks', async () => {
        const { deleteBlocksIfNotOnCloud } = await import('../../../../src/app/pieces/piece-sync-service')

        const deleted = await deleteBlocksIfNotOnCloud(
            [{ name: '@acme/block-private', version: '1.0.0', blockType: BlockType.CUSTOM }],
            [{ name: '@intelblocks/block-slack', version: '1.0.0' }],
            log,
        )

        expect(deleted).toBe(0)
        expect(bulkDelete).toHaveBeenCalledWith([])
    })
})
