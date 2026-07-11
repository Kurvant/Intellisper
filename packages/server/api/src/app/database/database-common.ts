import { IbEdition } from '@intelblocks/shared'
import { EntitySchemaColumnOptions } from 'typeorm'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { DatabaseType } from './database-type'

const databaseType = system.get(AppSystemProp.DB_TYPE)

export const COLLATION = databaseType === DatabaseType.PGLITE ? undefined : 'en_natural'

export const IbIdSchema = {
    type: String,
    length: 21,
} as EntitySchemaColumnOptions

export const BaseColumnSchemaPart = {
    id: {
        ...IbIdSchema,
        primary: true,
    } as EntitySchemaColumnOptions,
    created: {
        name: 'created',
        type: 'timestamp with time zone',
        createDate: true,
    } as EntitySchemaColumnOptions,
    updated: {
        name: 'updated',
        type: 'timestamp with time zone',
        updateDate: true,
    } as EntitySchemaColumnOptions,
}

export function isNotOneOfTheseEditions(editions: IbEdition[]): boolean {
    return !editions.includes(system.getEdition())
}