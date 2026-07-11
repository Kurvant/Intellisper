import { z } from 'zod'
import { BaseModelSchema } from '../../core/common/base-model'
import { IbId } from '../../core/common/id-generator'
import { UserWithMetaInformation } from '../../core/user/user'
import { ProjectMetaData } from '../../management/project/project'
import { ProjectRole } from '../../management/project-role/project-role'

export type ProjectMemberId = string

export const ProjectMember = z.object({
    ...BaseModelSchema,
    platformId: IbId,
    userId: IbId,
    projectId: z.string(),
    projectRoleId: IbId,
}).describe('Project member is which user is assigned to a project.')

export type ProjectMember = z.infer<typeof ProjectMember>

export const ProjectMemberWithUser = ProjectMember.extend({
    user: UserWithMetaInformation,
    projectRole: ProjectRole,
    project: ProjectMetaData,
})

export type ProjectMemberWithUser = z.infer<typeof ProjectMemberWithUser>
