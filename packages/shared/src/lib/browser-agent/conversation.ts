import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

export const AgentMessageRole = {
    SYSTEM: 'SYSTEM',
    USER: 'USER',
    ASSISTANT: 'ASSISTANT',
    TOOL: 'TOOL',
} as const
export type AgentMessageRole = (typeof AgentMessageRole)[keyof typeof AgentMessageRole]

export const AgentConversation = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    title: Nullable(z.string()),
    deletedAt: Nullable(z.string()),
})
export type AgentConversation = z.infer<typeof AgentConversation>

export const AgentMessage = z.object({
    ...BaseModelSchema,
    conversationId: z.string(),
    role: z.enum([
        AgentMessageRole.SYSTEM,
        AgentMessageRole.USER,
        AgentMessageRole.ASSISTANT,
        AgentMessageRole.TOOL,
    ]),
    content: z.string(),
    toolCalls: Nullable(z.array(z.unknown())),
})
export type AgentMessage = z.infer<typeof AgentMessage>
