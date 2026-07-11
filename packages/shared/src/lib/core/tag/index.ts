import { z } from 'zod'
import { BaseModelSchema } from '../common/base-model'

export const Tag = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    name: z.string(),
})

export type Tag = z.infer<typeof Tag>

export const BlockTag = z.object({
    ...BaseModelSchema,
    blockName: z.string(),
    tagId: z.string(),
    platformId: z.string(),
})

export type BlockTag = z.infer<typeof BlockTag>

export const ListTagsRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
})

export type ListTagsRequest = z.infer<typeof ListTagsRequest>

export const SetBlockTagsRequest = z.object({
    blocksName: z.array(z.string()),
    tags: z.array(z.string()),
})

export type SetBlockTagsRequest = z.infer<typeof SetBlockTagsRequest>

export const UpsertTagRequest = z.object({
    name: z.string(),
})

export type UpsertTagRequest = z.infer<typeof UpsertTagRequest>

export const DeleteTagRequest = z.object({
    id: z.string(),
})

export type DeleteTagRequest = z.infer<typeof DeleteTagRequest>
