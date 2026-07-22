import { ibDayjs } from '@intelblocks/server-utils'
import {
    assertNotNullOrUndefined,
    AuthenticationResponse,
    CreatePlatformRequest,
    ErrorCode,
    FileType,
    IbEdition,
    IbId,
    IntellisperError,
    isNil,
    PlatformWithoutSensitiveData,
    PrincipalType,
    SERVICE_KEY_SECURITY_OPENAPI,
    UpdatePlatformRequestBody,
    UserStatus,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { browserAgentTenancyService } from '../browser-agent/tenancy/browser-agent-tenancy.service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { platformToEditMustBeOwnedByCurrentUser } from '../enterprise/authentication/ee-authorization'
import { platformPlanService } from '../enterprise/platform/platform-plan/platform-plan.service'
import { stripeHelper } from '../enterprise/platform/platform-plan/stripe-helper'
import { platformProjectService } from '../enterprise/projects/platform-project-service'
import { fileService } from '../file/file.service'
import { system } from '../helper/system/system'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { userIdentityHelper } from '../helper/user-identity-helper'
import { projectService } from '../project/project-service'
import { userRepo, userService } from '../user/user-service'
import { platformService } from './platform.service'

const edition = system.getEdition()
export const platformController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreatePlatformEndpoint, async (req) => {
        const isOnboarding = req.principal.type === PrincipalType.ONBOARDING
        if (!isOnboarding && edition !== IbEdition.CLOUD) {
            // only first ee/ce user will be able to have onboarding token. which means any other principal type should not be able to create platform
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'This action is unauthorized in non cloud editions',
                },
            })
        }
        const identityId = isOnboarding
            ? req.principal.id
            : (await userService(req.log).getOneOrFail({ id: req.principal.id })).identityId
        // Intellisper one-platform-per-email guard — a no-op unless productScope includes the
        // browser agent, so stock blockunits platform creation is unaffected.
        await browserAgentTenancyService(req.log).assertCanCreateBrowserAgentPlatform({
            identityId,
            productScope: req.body.productScope,
        })
        const response = await platformService(req.log).createPlatformWithProject({
            identityId,
            name: req.body.name,
            invalidatePreviousTokens: isOnboarding,
        })
        // Enable the browser agent on the new platform when the product scope calls for it.
        if (!isNil(response.platformId)) {
            await browserAgentTenancyService(req.log).applyProductScope({
                platformId: response.platformId,
                productScope: req.body.productScope,
            })
        }
        return response
    })

    app.post('/:id', UpdatePlatformRequest, async (req, _res) => {
        if (req.principal.platform.id !== req.params.id) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'You are not authorized to access this platform',
                },
            })
        }
        const platformId = req.principal.platform.id

        const [logoIconUrl, fullLogoUrl, favIconUrl] = await Promise.all([
            fileService(app.log).uploadPublicAsset({
                file: req.body.logoIcon,
                type: FileType.PLATFORM_ASSET,
                platformId,
                metadata: { platformId },
            }),
            fileService(app.log).uploadPublicAsset({
                file: req.body.fullLogo,
                type: FileType.PLATFORM_ASSET,
                platformId,
                metadata: { platformId },
            }),
            fileService(app.log).uploadPublicAsset({
                file: req.body.favIcon,
                type: FileType.PLATFORM_ASSET,
                platformId,
                metadata: { platformId },
            }),
        ])

        await platformService(req.log).update({
            id: platformId,
            ...req.body,
            logoIconUrl,
            fullLogoUrl,
            favIconUrl,
        })
        return platformService(req.log).getOneWithPlanAndUsageOrThrow(platformId)
    })

    // Identity-wide account switcher: for the caller's identity, return the organizations
    // they belong to together with the workspaces they may see within each (spec C.5
    // cross-organization account view). USER-only — a service/API-key principal has no
    // cross-organization identity and is rejected.
    app.get('/', ListPlatformsForIdentityRequest, async (req) => {
        const callerUser = await userService(req.log).getOneOrFail({ id: req.principal.id })
        const usersOfIdentity = await userService(req.log).getUsersByIdentityId({ identityId: callerUser.identityId })

        const groups = await Promise.all(usersOfIdentity.map(async (user) => {
            if (isNil(user.platformId)) {
                return null
            }
            const platform = await platformService(req.log).getOne(user.platformId)
            if (isNil(platform)) {
                return null
            }
            const fullUser = await userService(req.log).getOneOrFail({ id: user.id })
            const projects = await projectService(req.log).getAllForUser({
                platformId: user.platformId,
                userId: user.id,
                isPrivileged: userService(req.log).isUserPrivileged(fullUser),
            })
            return {
                platformId: platform.id,
                platformName: platform.name,
                projects,
            }
        }))

        return groups.filter((group): group is NonNullable<typeof group> => !isNil(group))
    })

    app.get('/:id', GetPlatformRequest, async (req) => {
        if (req.principal.platform.id !== req.params.id) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'You are not authorized to access this platform',
                },
            })
        }
        const platform = await platformService(req.log).getOneWithPlanAndUsageOrThrow(req.principal.platform.id)
        if (req.principal.type === PrincipalType.USER) {
            const isEmbedded = await userIdentityHelper(req.log).isUserEmbedded(req.principal.id)
            if (isEmbedded) {
                return {
                    ...platform,
                    plan: {
                        ...platform.plan,
                        licenseKey: null,
                    },
                }
            }
        }
        return platform
    })

    app.get('/assets/:id', GetAssetRequest, async (req, reply) => {
        const { fileName, metadata, data } = await fileService(app.log).getDataOrThrow({
            fileId: req.params.id,
            type: [FileType.PLATFORM_ASSET, FileType.USER_PROFILE_PICTURE],
        })

        return reply
            .header(
                'Content-Disposition',
                `attachment; filename="${encodeURI(fileName ?? '')}"`,
            )
            .type(metadata?.mimetype ?? 'application/octet-stream')
            .status(StatusCodes.OK)
            .send(data)
    })


    if (edition === IbEdition.CLOUD) {
        app.delete('/:id', DeletePlatformRequest, async (req, res) => {
            await platformToEditMustBeOwnedByCurrentUser.call(app, req, res)
            assertNotNullOrUndefined(req.principal.platform.id, 'platformId')
            const isCloudNonEnterprisePlan = await platformPlanService(req.log).isCloudNonEnterprisePlan(req.params.id)
            if (!isCloudNonEnterprisePlan) {
                throw new IntellisperError({
                    code: ErrorCode.DOES_NOT_MEET_BUSINESS_REQUIREMENTS,
                    params: {
                        message: 'Platform is not eligible for deletion',
                    },
                })
            }
            const platformPlan = await platformPlanService(req.log).getOrCreateForPlatform(req.params.id)
            if (platformPlan.stripeSubscriptionId) {
                await stripeHelper(req.log).deleteCustomer(platformPlan.stripeSubscriptionId)
            }

            const platformId = req.params.id

            const user = await userService(req.log).getOneOrFail({
                id: req.principal.id,
            })

            await userRepo().update(
                { id: user.id, platformId },
                { status: UserStatus.INACTIVE },
            )

            const projectIds = await projectService(req.log).getProjectIdsByPlatform(platformId)
            await Promise.all(
                projectIds.map((projectId) =>
                    platformProjectService(req.log).markForDeletion({
                        id: projectId,
                        platformId,
                    }),
                ),
            )

            await systemJobsSchedule(req.log).upsertJob({
                job: {
                    name: SystemJobName.HARD_DELETE_PLATFORM,
                    data: {
                        platformId,
                        userId: user.id,
                        identityId: user.identityId,
                    },
                    jobId: `hard-delete-platform-${platformId}`,
                },
                schedule: {
                    type: 'one-time',
                    date: ibDayjs(),
                },
                customConfig: {
                    attempts: 25,
                    backoff: {
                        type: 'fixed',
                        delay: 60000,
                    },
                },
            })

            return res.status(StatusCodes.NO_CONTENT).send()
        })
    }
}

const CreatePlatformEndpoint = {
    config: {
        security: securityAccess.unscoped([PrincipalType.ONBOARDING, PrincipalType.USER]),
    },
    schema: {
        body: CreatePlatformRequest,
        response: {
            [StatusCodes.OK]: AuthenticationResponse,
        },
    },
}

const UpdatePlatformRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: UpdatePlatformRequestBody,
        params: z.object({
            id: IbId,
        }),
        response: {
            [StatusCodes.OK]: PlatformWithoutSensitiveData,
        },
    },
}


const ListPlatformsForIdentityRequest = {
    config: {
        // USER-only: the account switcher spans a human identity's organizations; a
        // service/API-key principal is scoped to a single organization and is rejected.
        security: securityAccess.publicPlatform([PrincipalType.USER]),
    },
    schema: {},
}

const GetPlatformRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['platforms'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        summary: 'Get a platform',
        description: 'Get a platform by id',
        params: z.object({
            id: IbId,
        }),
        response: {
            [StatusCodes.OK]: PlatformWithoutSensitiveData,
        },
    },
}

const DeletePlatformRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: z.object({
            id: IbId,
        }),
    },
}

const GetAssetRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}
