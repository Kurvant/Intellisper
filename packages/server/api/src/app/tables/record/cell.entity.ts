import { Cell, Field, Project, Record } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type CellSchema = Cell & {
    record: Record
    field: Field
    project: Project
}

export const CellEntity = new EntitySchema<CellSchema>({
    name: 'cell',
    columns: {
        ...BaseColumnSchemaPart,
        recordId: {
            ...IbIdSchema,
            nullable: false,
        },
        fieldId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        value: {
            type: 'varchar',
        },
    },
    indices: [
        {
            name: 'idx_cell_project_id_field_id_record_id_unique',
            columns: ['projectId', 'fieldId', 'recordId'],
            unique: true,
        },
    ],
    relations: {
        record: {
            type: 'many-to-one',
            target: 'record',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'recordId',
                foreignKeyConstraintName: 'fk_cell_record_id',
            },
        },
        field: {
            type: 'many-to-one',
            target: 'field',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'fieldId',
                foreignKeyConstraintName: 'fk_cell_field_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_cell_project_id',
            },
        },
    },
})