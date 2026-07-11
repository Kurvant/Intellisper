import { ibId } from '@intelblocks/shared'
import { In } from 'typeorm'
import { repoFactory } from '../../../core/db/repo-factory'
import { tagService } from '../tag-service'
import { BlockTagEntity } from './piece-tag.entity'


const blockTagsRepo = repoFactory(BlockTagEntity)

export const blockTagService = {
    async set(platformId: string, blockName: string, tags: string[]): Promise<void> {
        const tagIds = await Promise.all(tags.map(tag => tagService.upsert(platformId, tag).then(tag => tag.id)))
        await blockTagsRepo().delete({ blockName, platformId })
        await blockTagsRepo().upsert(tagIds.map(tagId => ({ id: ibId(), tagId, blockName, platformId })), ['tagId', 'pieceName'])
    },
    async findByPlatform(platformId: string):  Promise<Record<string, string[]>> {
        const blockTags = await blockTagsRepo().findBy({ platformId })
        const tagIds = Array.from(new Set(blockTags.map(blockTag => blockTag.tagId)))
        const tags = await tagService.findNamesByIds(tagIds)
        return blockTags.reduce((acc, blockTag) => {
            acc[blockTag.blockName] = acc[blockTag.blockName] || []
            acc[blockTag.blockName].push(tags[blockTag.tagId])
            return acc
        }, {} as Record<string, string[]>)
    },
    async deleteByTagId(tagId: string): Promise<void> {
        await blockTagsRepo().delete({ tagId })
    },
    async findByPlatformAndTags(platformId: string, blockTags: string[]): Promise<string[]> {
        const tagIds = await tagService.convertIdsToNames(platformId, blockTags)
        const blockTagEntities = await blockTagsRepo().findBy({
            platformId,
            tagId: In(tagIds),
        })
        return blockTagEntities.map(blockTag => blockTag.blockName)
    },

}