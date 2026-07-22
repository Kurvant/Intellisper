// Clean-room entity. Field set derived from the MIT shared type `ProjectRole`
// (packages/shared/.../management/project-role/project-role.ts) and the MIT
// frontend/API contract — NOT from any licensed entity source.
import { Platform, ProjectRole } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../../database/database-common'

type ProjectRoleSchema = ProjectRole & {
    platform: Platform
}

export const ProjectRoleEntity = new EntitySchema<ProjectRoleSchema>({
    name: 'project_role',
    columns: {
        ...BaseColumnSchemaPart,
        name: {
            type: String,
            nullable: false,
        },
        permissions: {
            type: String,
            array: true,
            nullable: false,
        },
        // Built-in roles are platform-agnostic (null platformId); custom roles
        // are scoped to a platform. Nullable per the MIT ProjectRole type.
        platformId: {
            ...IbIdSchema,
            nullable: true,
        },
        type: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_project_role_platform_id',
            columns: ['platformId'],
            unique: false,
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            nullable: true,
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_project_role_platform_id',
            },
        },
    },
})
