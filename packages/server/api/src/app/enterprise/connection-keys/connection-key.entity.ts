// Clean-room entity. Field set derived from the MIT shared type `ConnectionKey`
// (packages/shared/.../ee/product-embed/connection-keys/connection-key.ts).
// `settings` holds the signing-key connection material (jsonb, sensitive).
// NOT derived from any licensed source.
import { ConnectionKey, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type ConnectionKeySchema = ConnectionKey & {
    project: Project
}

export const ConnectionKeyEntity = new EntitySchema<ConnectionKeySchema>({
    name: 'connection_key',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        settings: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_connection_key_project_id',
            columns: ['projectId'],
            unique: false,
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_connection_key_project_id',
            },
        },
    },
})
