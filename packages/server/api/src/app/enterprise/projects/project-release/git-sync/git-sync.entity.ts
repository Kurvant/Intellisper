// Clean-room entity. Field set derived from the MIT shared type `GitRepo`
// (packages/shared/.../ee/git-repo/index.ts) — NOT from any licensed source.
import { GitBranchType, GitRepo, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../../../database/database-common'

type GitRepoSchema = GitRepo & {
    project: Project
}

export const GitRepoEntity = new EntitySchema<GitRepoSchema>({
    name: 'git_repo',
    columns: {
        ...BaseColumnSchemaPart,
        remoteUrl: {
            type: String,
            nullable: false,
        },
        branch: {
            type: String,
            nullable: false,
        },
        branchType: {
            type: String,
            enum: GitBranchType,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        // Sensitive: stored, never returned (GitRepoWithoutSensitiveData omits it).
        sshPrivateKey: {
            type: String,
            nullable: true,
        },
        slug: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_git_repo_project_id',
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
                foreignKeyConstraintName: 'fk_git_repo_project_id',
            },
        },
    },
})
