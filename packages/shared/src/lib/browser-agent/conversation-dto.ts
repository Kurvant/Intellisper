import { z } from 'zod'

/** List the acting user's conversations. projectId is required for project scoping (membership check). */
export const ListConversationsRequest = z.object({
    projectId: z.string(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListConversationsRequest = z.infer<typeof ListConversationsRequest>

/** List one conversation's messages. projectId is required for project scoping (membership check). */
export const ListConversationMessagesRequest = z.object({
    projectId: z.string(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListConversationMessagesRequest = z.infer<typeof ListConversationMessagesRequest>

/** Delete (soft) a conversation. projectId is required for project scoping (membership check). */
export const DeleteConversationRequest = z.object({
    projectId: z.string(),
})
export type DeleteConversationRequest = z.infer<typeof DeleteConversationRequest>

export const ConversationView = z.object({
    id: z.string(),
    title: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type ConversationView = z.infer<typeof ConversationView>

export const ListConversationsResponse = z.object({
    conversations: z.array(ConversationView),
    total: z.number(),
})
export type ListConversationsResponse = z.infer<typeof ListConversationsResponse>

export const ConversationMessageView = z.object({
    id: z.string(),
    conversationId: z.string(),
    role: z.string(),
    content: z.string(),
    /** jsonb tool-call payload (array or object per the model turn); null when the message has none. */
    toolCalls: z.unknown().nullable(),
    createdAt: z.string(),
})
export type ConversationMessageView = z.infer<typeof ConversationMessageView>

export const ListConversationMessagesResponse = z.object({
    messages: z.array(ConversationMessageView),
    total: z.number(),
})
export type ListConversationMessagesResponse = z.infer<typeof ListConversationMessagesResponse>
