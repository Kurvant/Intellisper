import { BlockOrderBy, BlockSortBy } from '@intelblocks/shared'
import dayjs from 'dayjs'
import { BlockMetadataSchema } from '../piece-metadata-entity'


export const blockSorting = {
    sortAndOrder: (
        sortBy: BlockSortBy | undefined,
        orderBy: BlockOrderBy | undefined,
        blocks: BlockMetadataSchema[],
    ): BlockMetadataSchema[] => {
        const sortByDefault = sortBy ?? BlockSortBy.NAME
        const orderByDefault = orderBy ?? BlockOrderBy.ASC
        const sortedBlock = sortBlocks(sortByDefault, blocks)

        return reverseIfDesc(orderByDefault, sortedBlock)
    },
}


const sortBlocks = (
    sortBy: BlockSortBy | undefined,
    blocks: BlockMetadataSchema[],
): BlockMetadataSchema[] => {
    const sortByDefault = sortBy ?? BlockSortBy.NAME
    switch (sortByDefault) {
        case BlockSortBy.POPULARITY: {
            return sortByPopularity(blocks)
        }
        case BlockSortBy.NAME: {
            return sortByName(blocks)
        }
        case BlockSortBy.UPDATED: {
            return sortByUpdated(blocks)
        }
        case BlockSortBy.CREATED: {
            return sortByCreated(blocks)
        }
    }
}
const reverseIfDesc = (
    orderBy: BlockOrderBy,
    blocks: BlockMetadataSchema[],
): BlockMetadataSchema[] => {
    if (orderBy === BlockOrderBy.ASC) {
        return blocks
    }
    return blocks.reverse()
}

const sortByPopularity = (blocks: BlockMetadataSchema[]): BlockMetadataSchema[] => {
    return blocks.sort((a, b) =>
        a.projectUsage - b.projectUsage,
    )
}


const sortByName = (blocks: BlockMetadataSchema[]): BlockMetadataSchema[] => {
    return blocks.sort((a, b) =>
        a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase()),
    )
}

const sortByCreated = (blocks: BlockMetadataSchema[]): BlockMetadataSchema[] => {
    return blocks.sort(
        (a, b) => dayjs(a.created).unix() - dayjs(b.created).unix(),
    )
}

const sortByUpdated = (blocks: BlockMetadataSchema[]): BlockMetadataSchema[] => {
    return blocks.sort(
        (a, b) => dayjs(a.updated).unix() - dayjs(b.updated).unix(),
    )
}
