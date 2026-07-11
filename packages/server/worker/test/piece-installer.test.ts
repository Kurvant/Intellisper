import { access, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PackageType, BlockType } from '@intelblocks/shared'
import type { OfficialBlockPackage } from '@intelblocks/shared'
import type { Logger } from 'pino'

// Module-level variable updated per test so the vi.mock factory can reference it
let testWorkspace = ''

const mockInstall = vi.fn()

vi.mock('../src/lib/cache/code/bun-runner', () => ({
    bunRunner: () => ({
        install: mockInstall,
    }),
}))

vi.mock('../src/lib/config/worker-settings', () => ({
    workerSettings: {
        getSettings: () => ({
            EXECUTION_MODE: 'UNSANDBOXED',
            DEV_BLOCKS: [],
        }),
    },
}))

vi.mock('../src/lib/cache/cache-paths', () => ({
    getGlobalCacheCommonPath: () => testWorkspace,
    getGlobalCachePathLatestVersion: () => testWorkspace,
}))

// Import after mocks are registered
const { blockInstaller } = await import('../src/lib/cache/pieces/piece-installer')

function makePiece(name: string, version = '1.0.0'): OfficialBlockPackage {
    return {
        packageType: PackageType.REGISTRY,
        blockType: BlockType.OFFICIAL,
        blockName: name,
        blockVersion: version,
    }
}

function pieceDirPath(piece: OfficialBlockPackage): string {
    return join(testWorkspace, 'pieces', `${piece.blockName}-${piece.blockVersion}`)
}

function readyFilePath(piece: OfficialBlockPackage): string {
    return join(pieceDirPath(piece), 'ready')
}

async function pathExists(p: string): Promise<boolean> {
    return access(p).then(() => true, () => false)
}

const fakeLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
} as unknown as Logger

// REGISTRY pieces don't call apiClient.getPieceArchive so an empty object suffices
const fakeApiClient = {} as never

beforeEach(async () => {
    testWorkspace = join(tmpdir(), `piece-installer-test-${randomUUID()}`)
    await mkdir(testWorkspace, { recursive: true })
    vi.clearAllMocks()
})

afterEach(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(testWorkspace, { recursive: true, force: true })
})

describe('pieceInstaller', () => {
    it('batch install succeeds — all pieces marked ready', async () => {
        const piece1 = makePiece('@intelblocks/block-a')
        const piece2 = makePiece('@intelblocks/block-b')
        const installer = blockInstaller(fakeLog, fakeApiClient)

        mockInstall.mockResolvedValueOnce({ output: '' })

        await installer.install({ blocks: [piece1, piece2], includeFilters: true })

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(await pathExists(readyFilePath(piece1))).toBe(true)
        expect(await pathExists(readyFilePath(piece2))).toBe(true)
    })

    it('batch fails with good and bad piece — good piece marked ready, bad piece rolled back', async () => {
        const good = makePiece('@intelblocks/block-good')
        const bad = makePiece('@intelblocks/block-bad')
        const installer = blockInstaller(fakeLog, fakeApiClient)

        mockInstall
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // batch attempt
            .mockResolvedValueOnce({ output: '' })                           // good individual
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // bad individual

        const error = await installer.install({ blocks: [good, bad], includeFilters: false }).catch(e => e as Error)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('@intelblocks/block-bad@1.0.0')
        expect(error.message).not.toContain('@intelblocks/block-good@1.0.0')
        expect(mockInstall).toHaveBeenCalledTimes(3)

        expect(await pathExists(readyFilePath(good))).toBe(true)
        expect(await pathExists(pieceDirPath(bad))).toBe(false)
    })

    it('batch fails with both pieces bad — both rolled back, error names both', async () => {
        const piece1 = makePiece('@intelblocks/block-x')
        const piece2 = makePiece('@intelblocks/block-y')
        const installer = blockInstaller(fakeLog, fakeApiClient)

        mockInstall
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // batch
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // piece-x individual
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // piece-y individual

        const error = await installer.install({ blocks: [piece1, piece2], includeFilters: false }).catch(e => e as Error)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('@intelblocks/block-x@1.0.0')
        expect(error.message).toContain('@intelblocks/block-y@1.0.0')
        expect(mockInstall).toHaveBeenCalledTimes(3)

        expect(await pathExists(pieceDirPath(piece1))).toBe(false)
        expect(await pathExists(pieceDirPath(piece2))).toBe(false)
    })

    it('single piece fails — rolled back immediately, no individual retry', async () => {
        const piece = makePiece('@intelblocks/block-solo')
        const installer = blockInstaller(fakeLog, fakeApiClient)

        mockInstall.mockRejectedValueOnce(new Error('install failure'))

        await expect(installer.install({ blocks: [piece], includeFilters: true })).rejects.toThrow('install failure')

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(await pathExists(pieceDirPath(piece))).toBe(false)
    })

    it('piece already installed — bun install never called', async () => {
        const piece = makePiece('@intelblocks/block-cached')
        const pieceDir = pieceDirPath(piece)

        await mkdir(join(pieceDir, 'node_modules'), { recursive: true })
        await writeFile(join(pieceDir, 'ready'), 'true')

        const installer = blockInstaller(fakeLog, fakeApiClient)
        await installer.install({ blocks: [piece], includeFilters: true })

        expect(mockInstall).not.toHaveBeenCalled()
    })

    it('individual fallback always passes --filter path regardless of includeFilters', async () => {
        const piece1 = makePiece('@intelblocks/block-filter-a')
        const piece2 = makePiece('@intelblocks/block-filter-b')
        const installer = blockInstaller(fakeLog, fakeApiClient)

        mockInstall
            .mockRejectedValueOnce(new Error('batch error'))
            .mockResolvedValueOnce({ output: '' })
            .mockResolvedValueOnce({ output: '' })

        // Use includeFilters: false so the batch call has no filters
        await installer.install({ blocks: [piece1, piece2], includeFilters: false })

        expect(mockInstall).toHaveBeenCalledTimes(3)

        // Batch call uses empty filtersPath because includeFilters is false
        expect(mockInstall.mock.calls[0]?.[0]).toMatchObject({ filtersPath: [] })

        // Individual calls must always include the --filter path (sequential order)
        expect(mockInstall.mock.calls[1]?.[0]).toMatchObject({
            filtersPath: [expect.stringContaining(`${piece1.blockName}-${piece1.blockVersion}`)],
        })
        expect(mockInstall.mock.calls[2]?.[0]).toMatchObject({
            filtersPath: [expect.stringContaining(`${piece2.blockName}-${piece2.blockVersion}`)],
        })
    })
})
