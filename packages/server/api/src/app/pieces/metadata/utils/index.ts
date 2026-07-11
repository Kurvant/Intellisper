import { BlockCategory, BlockOrderBy, BlockSortBy, PlatformId, SuggestionType } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { enterpriseFilteringUtils } from '../../../enterprise/pieces/filters/piece-filtering-utils'
import { BlockMetadataSchema } from '../piece-metadata-entity'
import { blockSearching } from './piece-searching'
import { blockSorting } from './piece-sorting'

export const blockListUtils = (log: FastifyBaseLogger) => ({
    async filterBlocks(params: FilterBlocksParams): Promise<BlockMetadataSchema[]> {
        const sortedBlocks = blockSorting.sortAndOrder(
            params.sortBy,
            params.orderBy,
            params.blocks,
        )

        const userBasedBlocks = blockSearching.search({
            categories: params.categories,
            searchQuery: params.searchQuery,
            blocks: sortedBlocks,
            suggestionType: params.suggestionType,
        })

        return enterpriseFilteringUtils(log).filter({
            blocks: userBasedBlocks,
            includeHidden: params.includeHidden,
            platformId: params.platformId,
            projectId: params.projectId,
        })
    },
})

export type FilterBlocksParams = {
    includeHidden?: boolean
    platformId?: PlatformId
    searchQuery?: string
    categories?: BlockCategory[]
    projectId?: string
    sortBy?: BlockSortBy
    orderBy?: BlockOrderBy
    blocks: BlockMetadataSchema[]
    suggestionType?: SuggestionType
}

export * from './piece-cache-utils'