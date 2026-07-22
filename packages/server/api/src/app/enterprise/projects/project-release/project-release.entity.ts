// Clean-room entity. Field set derived from the MIT shared type `ProjectRelease`
// (packages/shared/.../automation/project-release/project-release.ts) — NOT from
// any licensed source. `importedByUser` is a read-time join, not a stored column.
import { Project, ProjectRelease, ProjectReleaseType } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../../database/database-common'

type ProjectReleaseSchema = ProjectRelease & {
    project: Project
}

export const ProjectReleaseEntity = new EntitySchema<ProjectReleaseSchema>({
    name: 'project_release',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        name: {
            type: String,
            nullable: false,
        },
        description: {
            type: String,
            nullable: true,
        },
        importedBy: {
            ...IbIdSchema,
            nullable: true,
        },
        fileId: {
            ...IbIdSchema,
            nullable: false,
        },
        type: {
            type: String,
            enum: ProjectReleaseType,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_project_release_project_id',
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
                foreignKeyConstraintName: 'fk_project_release_project_id',
            },
        },
    },
})
