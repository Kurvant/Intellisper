// Clean-room entity. Field set derived from the MIT shared type `ProjectPlan`
// (packages/shared/.../management/project/project.ts) — NOT from any licensed source.
import { BlocksFilterType, Project, ProjectPlan } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../../database/database-common'

type ProjectPlanSchema = ProjectPlan & {
    project: Project
}

export const ProjectPlanEntity = new EntitySchema<ProjectPlanSchema>({
    name: 'project_plan',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        locked: {
            type: Boolean,
            nullable: false,
        },
        name: {
            type: String,
            nullable: false,
        },
        blocksFilterType: {
            type: String,
            enum: BlocksFilterType,
            nullable: false,
        },
        blocks: {
            type: String,
            array: true,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_project_plan_project_id',
            columns: ['projectId'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_project_plan_project_id',
            },
        },
    },
})
