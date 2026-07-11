import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
    ibId,
    FilteredBlockBehavior,
    McpServerType,
    PackageType,
    BlockType,
    ProjectScopedMcpServer,
} from '@intelblocks/shared'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import { createTestContext } from '../../../helpers/test-context'
import { db } from '../../../helpers/db'
import { createMockBlockMetadata } from '../../../helpers/mocks'
import { blockCache } from '../../../../src/app/pieces/metadata/piece-cache'
import { ibResearchBlocksTool } from '../../../../src/app/mcp/tools/ib-research-blocks'

let app: FastifyInstance
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app.log
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('MCP piece visibility', () => {
    it('ib_research_blocks — does NOT return pieces hidden by platform admin (BLOCKED behavior)', async () => {
        const blockedPieceName = '@intelblocks/block-hidden-by-admin'

        const ctx = await createTestContext(app, {
            platform: {
                filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                filteredBlockNames: [blockedPieceName],
            },
        })
        const mcp = makeMcp(ctx.project.id)

        const blockedPiece = createMockBlockMetadata({
            name: blockedPieceName,
            displayName: 'Hidden By Admin',
            version: '0.1.0',
            blockType: BlockType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            platformId: undefined,
            actions: {},
            triggers: {},
        })
        await db.save('block_metadata', blockedPiece)
        await blockCache(mockLog).setup()

        const result = await ibResearchBlocksTool(mcp, mockLog).execute({})

        expect(text(result)).toContain('✅')
        expect(text(result)).not.toContain(blockedPieceName)
    })

    it('ib_research_blocks — returns pieces NOT in the platform blocklist', async () => {
        const visiblePieceName = '@intelblocks/block-visible'

        const ctx = await createTestContext(app, {
            platform: {
                filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                filteredBlockNames: ['@intelblocks/block-something-else'],
            },
        })
        const mcp = makeMcp(ctx.project.id)

        const visiblePiece = createMockBlockMetadata({
            name: visiblePieceName,
            displayName: 'Visible Block',
            version: '0.1.0',
            blockType: BlockType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            platformId: undefined,
            actions: {},
            triggers: {},
        })
        await db.save('block_metadata', visiblePiece)
        await blockCache(mockLog).setup()

        const result = await ibResearchBlocksTool(mcp, mockLog).execute({})

        expect(text(result)).toContain('✅')
        expect(text(result)).toContain(visiblePieceName)
    })
})

function makeMcp(projectId: string): ProjectScopedMcpServer {
    return {
        id: ibId(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        projectId,
        platformId: null,
        type: McpServerType.PROJECT,
        token: ibId(),
        disabledTools: null,
    }
}

function text(result: { content: Array<{ type: 'text', text: string }> }): string {
    return result.content.map(c => c.text).join('\n')
}
