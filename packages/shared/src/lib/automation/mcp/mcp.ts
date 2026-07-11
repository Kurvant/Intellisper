import { z } from 'zod'
import { BaseModelSchema } from '../../core/common'
import { IbId } from '../../core/common/id-generator'
import { Permission } from '../../core/common/security/permission'
import { PopulatedFlow } from '../flows/flow'

export type McpId = IbId

export const MCP_TRIGGER_BLOCK_NAME = '@intelblocks/block-mcp'

export enum McpServerType {
    PLATFORM = 'PLATFORM',
    PROJECT = 'PROJECT',
}

export const McpServer = z.object({
    ...BaseModelSchema,
    platformId: IbId.nullable(),
    projectId: IbId.nullable(),
    type: z.enum([McpServerType.PLATFORM, McpServerType.PROJECT]),
    token: IbId,
    disabledTools: z.array(z.string()).nullable(),
})

export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),
})
export type PopulatedMcpServer = z.infer<typeof PopulatedMcpServer>

export type McpServer = z.infer<typeof McpServer>

export type ProjectScopedMcpServer = McpServer & { projectId: string }

export type McpToolContext = {
    mcp: ProjectScopedMcpServer
    userId?: string
}

export const UpdateMcpServerRequest = z.object({
    disabledTools: z.array(z.string()).optional(),
})

export type UpdateMcpServerRequest = z.infer<typeof UpdateMcpServerRequest>

/** Tool definition for MCP: inputSchema is a raw Zod shape (same as MCP expects). */
export type McpToolDefinition = {
    title: string
    description: string
    inputSchema: Record<string, z.ZodTypeAny>
    annotations?: {
        readOnlyHint?: boolean
        destructiveHint?: boolean
        idempotentHint?: boolean
        openWorldHint?: boolean
    }
    permission?: Permission
    execute: (args: Record<string, unknown>) => Promise<McpToolResult>
}

export type McpToolResult = {
    content: Array<{ type: 'text', text: string }>
    structuredContent?: Record<string, unknown>
    isError?: boolean
}
