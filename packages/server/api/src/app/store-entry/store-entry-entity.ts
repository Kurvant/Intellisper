import { STORE_KEY_MAX_LENGTH, StoreEntry } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    IbIdSchema,
} from '../database/database-common'

type StoreEntrySchema = StoreEntry

export const StoreEntryEntity = new EntitySchema<StoreEntrySchema>({
    name: 'store-entry',
    columns: {
        ...BaseColumnSchemaPart,
        key: {
            type: String,
            length: STORE_KEY_MAX_LENGTH,
        },
        projectId: IbIdSchema,
        value: {
            type: 'jsonb',
            nullable: true,
        },
    },    
    uniques: [
        {
            columns: ['projectId', 'key'],
        },
    ],
})
