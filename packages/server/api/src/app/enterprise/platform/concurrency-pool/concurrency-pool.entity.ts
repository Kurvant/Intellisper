// Clean-room entity. Field set derived from the MIT shared type `ConcurrencyPool`
// (packages/shared/.../management/platform/concurrency-pool.ts)

import { ConcurrencyPool, Platform } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../../database/database-common'

type ConcurrencyPoolSchema = ConcurrencyPool & {
    platform: Platform
}

export const ConcurrencyPoolEntity = new EntitySchema<ConcurrencyPoolSchema>({
    name: 'concurrency_pool',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        key: {
            type: String,
            nullable: false,
        },
        maxConcurrentJobs: {
            type: Number,
            nullable: false,
        },
    },
    indices: [
        // A pool key is unique within a platform.
        {
            name: 'idx_concurrency_pool_platform_id_key',
            columns: ['platformId', 'key'],
            unique: true,
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_concurrency_pool_platform_id',
            },
        },
    },
})
