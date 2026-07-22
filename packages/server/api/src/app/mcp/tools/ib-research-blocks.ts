import {
    BlockCategory,
    isNil,
    LocalesEnum,
    McpToolDefinition,
    ProjectScopedMcpServer,
    SuggestionType,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { blockMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { mcpUtils } from './mcp-utils'

const BULK_LOOKUP_CAP = 20

const researchBlocksSchema = z.object({
    blockNames: z.array(z.string()).optional().describe('Exact block names to look up (e.g. ["gmail", "slack", "@intelblocks/block-google-sheets"]). Always returns actions and triggers for each block.'),
    categories: z.array(z.enum(Object.values(BlockCategory) as [string, ...string[]])).optional(),
    tags: z.array(z.string()).optional(),
    searchQuery: z.string().optional(),
    suggestionType: z.enum(Object.values(SuggestionType) as [string, ...string[]]).optional(),
    locale: z.enum(Object.values(LocalesEnum) as [string, ...string[]]).optional(),
    includeActions: z.boolean().optional(),
    includeTriggers: z.boolean().optional(),
})

export const ibResearchBlocksTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_research_blocks',
        description: 'Research available blocks. Use blockNames for bulk exact lookup (always returns actions and triggers). Use searchQuery for fuzzy discovery.',
        inputSchema: {
            blockNames: researchBlocksSchema.shape.blockNames,
            categories: researchBlocksSchema.shape.categories,
            tags: researchBlocksSchema.shape.tags,
            searchQuery: researchBlocksSchema.shape.searchQuery,
            suggestionType: researchBlocksSchema.shape.suggestionType,
            locale: researchBlocksSchema.shape.locale,
            includeActions: z.boolean().optional().describe('When true, include action names and descriptions for each block (only applies to searchQuery mode)'),
            includeTriggers: z.boolean().optional().describe('When true, include trigger names and descriptions for each block (only applies to searchQuery mode)'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: async (args) => {
            try {
                const params = researchBlocksSchema.parse(args ?? {})
                const platformId = await mcpUtils.resolvePlatformId({ mcp, log })
                const projectId = mcpUtils.isProjectScoped(mcp) ? mcp.projectId : undefined

                if (params.blockNames && params.blockNames.length > 0) {
                    return await bulkLookup({
                        blockNames: params.blockNames,
                        projectId,
                        platformId,
                        log,
                    })
                }

                return await searchBlocks({
                    params,
                    projectId,
                    platformId,
                    log,
                })
            }
            catch (err) {
                return mcpUtils.mcpToolError('Failed to research blocks', err)
            }
        },
    }
}

function summarizeComponent(c: { name: string, displayName: string, description: string, requireAuth: boolean }): ComponentSummary {
    return { name: c.name, displayName: c.displayName, description: c.description, requiresAuth: c.requireAuth }
}

async function bulkLookup({ blockNames, projectId, platformId, log }: {
    blockNames: string[]
    projectId: string | undefined
    platformId: string
    log: FastifyBaseLogger
}): Promise<{ content: [{ type: 'text', text: string }], structuredContent: Record<string, unknown> }> {
    const capped = blockNames.slice(0, BULK_LOOKUP_CAP)
    const svc = blockMetadataService(log)
    const results = await Promise.all(capped.map(async (rawName) => {
        const normalized = mcpUtils.normalizeBlockName(rawName)
        if (isNil(normalized)) {
            return { name: rawName, found: false as const }
        }
        const block = await svc.get({ name: normalized, projectId, platformId })
        if (isNil(block)) {
            return { name: normalized, found: false as const }
        }
        return {
            name: block.name,
            found: true as const,
            displayName: block.displayName,
            description: block.description,
            actions: Object.values(block.actions).map(summarizeComponent),
            triggers: Object.values(block.triggers).map(summarizeComponent),
        }
    }))

    const found = results.filter((r) => r.found)
    const missing = results.filter((r) => !r.found)
    const hints: string[] = []
    if (missing.length > 0) {
        hints.push(`⚠️ Not found: ${missing.map((m) => m.name).join(', ')}`)
    }
    if (blockNames.length > BULK_LOOKUP_CAP) {
        hints.push(`⚠️ Only the first ${BULK_LOOKUP_CAP} blocks were looked up (${blockNames.length} requested)`)
    }
    const hintText = hints.length > 0 ? `\n\n${hints.join('\n')}` : ''

    return {
        content: [{ type: 'text', text: `✅ Researched ${found.length} block(s)${hintText}:\n${JSON.stringify(found)}` }],
        structuredContent: {
            blocks: found,
            missing: missing.map((m) => m.name),
            count: found.length,
        },
    }
}

async function searchBlocks({ params, projectId, platformId, log }: {
    params: z.infer<typeof researchBlocksSchema>
    projectId: string | undefined
    platformId: string
    log: FastifyBaseLogger
}): Promise<{ content: [{ type: 'text', text: string }], structuredContent: Record<string, unknown> }> {
    const svc = blockMetadataService(log)
    const blocks = await svc.list({
        projectId,
        platformId,
        includeHidden: false,
        categories: params.categories as BlockCategory[] | undefined,
        tags: params.tags,
        searchQuery: params.searchQuery,
        suggestionType: params.suggestionType as SuggestionType | undefined,
        locale: params.locale as LocalesEnum | undefined,
    })

    if (!params.includeActions && !params.includeTriggers) {
        const totalCount = blocks.length
        const LIST_CAP = 50
        const capped = blocks.slice(0, LIST_CAP).map((p) => ({
            name: p.name,
            displayName: p.displayName,
            description: p.description,
            actions: p.actions,
            triggers: p.triggers,
        }))
        const hint = totalCount > LIST_CAP ? ` (showing ${LIST_CAP} of ${totalCount} — use searchQuery to narrow results)` : ''
        return {
            content: [{ type: 'text', text: `✅ Found blocks${hint}:\n${JSON.stringify(capped)}` }],
            structuredContent: {
                blocks: capped.map((p) => ({ name: p.name, displayName: p.displayName, description: p.description })),
                count: capped.length,
                totalCount,
            },
        }
    }

    const totalCount = blocks.length
    const ENRICHED_CAP = 10
    const blocksToEnrich = blocks.slice(0, ENRICHED_CAP)
    const enrichedBlocks = await Promise.all(blocksToEnrich.map(async (block) => {
        const enriched: EnrichedBlock = {
            name: block.name,
            displayName: block.displayName,
            description: block.description,
        }
        const fullBlock = await svc.get({
            name: block.name,
            version: block.version,
            projectId,
            platformId,
        })
        if (fullBlock) {
            if (params.includeActions) {
                enriched.actions = Object.values(fullBlock.actions).map(summarizeComponent)
            }
            if (params.includeTriggers) {
                enriched.triggers = Object.values(fullBlock.triggers).map(summarizeComponent)
            }
        }
        return enriched
    }))

    const overflowHint = totalCount > ENRICHED_CAP
        ? ` (showing top ${ENRICHED_CAP} of ${totalCount} results — use a more specific searchQuery to narrow results)`
        : ''
    return {
        content: [{ type: 'text', text: `✅ Found blocks${overflowHint}:\n${JSON.stringify(enrichedBlocks)}` }],
        structuredContent: {
            blocks: enrichedBlocks,
            count: enrichedBlocks.length,
            totalCount,
        },
    }
}

type ComponentSummary = {
    name: string
    displayName: string
    description: string
    requiresAuth: boolean
}

type EnrichedBlock = {
    name: string
    displayName: string
    description: string
    actions?: ComponentSummary[]
    triggers?: ComponentSummary[]
}
