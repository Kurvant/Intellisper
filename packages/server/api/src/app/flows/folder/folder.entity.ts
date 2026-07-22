import { Flow, Folder as Folder, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    IbIdSchema,
} from '../../database/database-common'

export type FolderSchema = {
    flows: Flow[]
    project: Project
} & Folder

export const FolderEntity = new EntitySchema<FolderSchema>({
    name: 'folder',
    columns: {
        ...BaseColumnSchemaPart,
        displayName: {
            type: String,
        },
        projectId: IbIdSchema,
        displayOrder: {
            type: Number,
            default: 0,
        },
    },
    indices: [
        {
            name: 'idx_folder_project_id_display_name',
            columns: ['projectId', 'displayName'],
            unique: true,
        },
    ],
    relations: {
        flows: {
            type: 'one-to-many',
            target: 'flow',
            inverseSide: 'folder',
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_folder_project',
            },
        },
    },
})