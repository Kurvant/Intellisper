import { BlockTag, Platform, Tag } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../../database/database-common'

export type BlockTagSchema = BlockTag & {
    tag: Tag
    platform: Platform
}
export const BlockTagEntity = new EntitySchema<BlockTagSchema>({
    name: 'block_tag',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            type: String,
        },
        blockName: {
            type: String,
        },
        tagId: {
            type: String,
        },
    },
    uniques: [
        {
            columns: ['tagId', 'blockName'],
        },
    ],
    indices: [
        {
            name: 'tag_platformId',
            columns: ['platformId'],
        },
    ],
    relations: {
        tag: {
            target: 'tag',
            type: 'many-to-one',
            cascade: true,
            joinColumn: {
                name: 'tagId',
            },
        },
        platform: {
            target: 'platform',
            type: 'many-to-one',
            cascade: true,
            joinColumn: {
                name: 'platformId',
            },
        },
    },
})
