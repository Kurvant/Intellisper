// Clean-room entity. Field set derived from the MIT shared type `ProjectMember`
// (packages/shared/.../project-members/project-member.ts) and the MIT core's
// access queries — NOT from any licensed entity source.
import { Platform, Project, ProjectMember, ProjectRole, User } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../../database/database-common'

type ProjectMemberSchema = ProjectMember & {
    user: User
    project: Project
    platform: Platform
    projectRole: ProjectRole
}

export const ProjectMemberEntity = new EntitySchema<ProjectMemberSchema>({
    name: 'project_member',
    columns: {
        ...BaseColumnSchemaPart,
        userId: {
            ...IbIdSchema,
            nullable: false,
        },
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectRoleId: {
            ...IbIdSchema,
            nullable: false,
        },
    },
    indices: [
        // A user holds at most one membership per project. Uniqueness on
        // (projectId, userId, platformId) per the MIT access model.
        {
            name: 'idx_project_member_project_id_user_id_platform_id',
            columns: ['projectId', 'userId', 'platformId'],
            unique: true,
        },
        {
            name: 'idx_project_member_user_id_platform_id',
            columns: ['userId', 'platformId'],
            unique: false,
        },
        {
            name: 'idx_project_member_project_role_id',
            columns: ['projectRoleId'],
            unique: false,
        },
    ],
    relations: {
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_project_member_user_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_project_member_project_id',
            },
        },
        platform: {
            type: 'many-to-one',
            target: 'platform',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_project_member_platform_id',
            },
        },
        projectRole: {
            type: 'many-to-one',
            target: 'project_role',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectRoleId',
                foreignKeyConstraintName: 'fk_project_member_project_role_id',
            },
        },
    },
})
