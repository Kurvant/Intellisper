import { LATEST_CONTEXT_VERSION, BlockMetadata } from '@intelblocks/blocks-framework'
import { ibDayjs } from '@intelblocks/server-utils'
import {
    AiCreditsAutoTopUpState,
    AIProvider,
    AIProviderName,
    ibId,
    ApiKey,
    AppConnection,
    AppConnectionScope,
    AppConnectionStatus,
    AppConnectionType,
    ApplicationEvent,
    ApplicationEventName,
    assertNotNullOrUndefined,
    Cell,
    ColorName,
    EventDestinationScope,
    Field,
    FieldType,
    File,
    FileCompression,
    FileLocation,
    FileType,
    FilteredBlockBehavior,
    Flow,
    FlowOperationStatus,
    FlowRun,
    FlowRunStatus,
    FlowStatus,
    FlowTriggerType,
    FlowVersion,
    FlowVersionState,
    LATEST_FLOW_SCHEMA_VERSION,
    Folder,
    GitBranchType,
    GitRepo,
    InvitationStatus,
    InvitationType,
    KeyAlgorithm,
    OAuthApp,
    OtpModel,
    OtpState,
    OtpType,
    PackageType,
    BlocksFilterType,
    BlockType,
    Platform,
    PlatformPlan,
    PlatformRole,
    Project,
    ProjectIcon,
    ProjectMember,
    ProjectPlan,
    ProjectRelease,
    ProjectReleaseType,
    ProjectRole,
    ProjectType,
    Record,
    RoleType,
    RunEnvironment,
    SigningKey,
    Table,
    TeamProjectsLimit,
    Template,
    TemplateStatus,
    TemplateType,
    User,
    UserIdentity,
    UserIdentityProvider,
    UserInvitation,
    UserStatus } from '@intelblocks/shared'
import { faker } from '@faker-js/faker'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { AIProviderSchema } from '../../../src/app/ai/ai-provider-entity'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { generateApiKey } from '../../../src/app/enterprise/api-keys/api-key-service'
import { OAuthAppWithEncryptedSecret } from '../../../src/app/enterprise/oauth-apps/oauth-app.entity'
import { PlatformPlanEntity } from '../../../src/app/enterprise/platform/platform-plan/platform-plan.entity'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { BlockMetadataSchema } from '../../../src/app/pieces/metadata/piece-metadata-entity'
import { blockMetadataService } from '../../../src/app/pieces/metadata/piece-metadata-service'
import { BlockTagSchema } from '../../../src/app/pieces/tags/pieces/piece-tag.entity'
import { TagEntitySchema } from '../../../src/app/pieces/tags/tag-entity'

export const CLOUD_PLATFORM_ID = 'cloud-id'

export const createMockUserIdentity = (userIdentity?: Partial<UserIdentity>): UserIdentity => {
    return {
        id: userIdentity?.id ?? ibId(),
        created: userIdentity?.created ?? faker.date.recent().toISOString(),
        updated: userIdentity?.updated ?? faker.date.recent().toISOString(),
        email: (userIdentity?.email ?? faker.internet.email()).toLowerCase().trim(),
        firstName: userIdentity?.firstName ?? faker.person.firstName(),
        lastName: userIdentity?.lastName ?? faker.person.lastName(),
        tokenVersion: userIdentity?.tokenVersion ?? undefined,
        password: userIdentity?.password
            ? bcrypt.hashSync(userIdentity.password, 10)
            : faker.internet.password(),
        trackEvents: userIdentity?.trackEvents ?? faker.datatype.boolean(),
        newsLetter: userIdentity?.newsLetter ?? faker.datatype.boolean(),
        verified: userIdentity?.verified ?? faker.datatype.boolean(),
        provider: userIdentity?.provider ?? UserIdentityProvider.EMAIL,
    }
}

export const createMockUser = (user?: Partial<User>): User => {
    return {
        id: user?.id ?? ibId(),
        created: user?.created ?? faker.date.recent().toISOString(),
        updated: user?.updated ?? faker.date.recent().toISOString(),
        status: user?.status ?? UserStatus.ACTIVE,
        platformRole: user?.platformRole ?? faker.helpers.enumValue(PlatformRole),
        externalId: user?.externalId,
        identityId: user?.identityId ?? ibId(),
        platformId: user?.platformId ?? null,
    }
}

export const createMockOAuthApp = async (
    oAuthApp?: Partial<OAuthApp>,
): Promise<OAuthAppWithEncryptedSecret> => {
    return {
        id: oAuthApp?.id ?? ibId(),
        created: oAuthApp?.created ?? faker.date.recent().toISOString(),
        updated: oAuthApp?.updated ?? faker.date.recent().toISOString(),
        platformId: oAuthApp?.platformId ?? ibId(),
        blockName: oAuthApp?.blockName ?? faker.lorem.word(),
        clientId: oAuthApp?.clientId ?? ibId(),
        clientSecret: await encryptUtils.encryptString(faker.lorem.word()),
    }
}

export const createMockTemplate = (
    template?: Partial<Template>,
): Template => {
    return {
        id: template?.id ?? ibId(),
        created: template?.created ?? faker.date.recent().toISOString(),
        updated: template?.updated ?? faker.date.recent().toISOString(),
        blocks: template?.blocks ?? [],
        flows: template?.flows ?? [createMockFlowVersion()],
        platformId: template?.platformId ?? ibId(),
        name: template?.name ?? faker.lorem.word(),
        type: template?.type ?? TemplateType.CUSTOM,
        description: template?.description ?? faker.lorem.sentence(),
        summary: template?.summary ?? faker.lorem.sentence(),
        tags: template?.tags ?? [],
        blogUrl: template?.blogUrl ?? faker.internet.url(),
        metadata: template?.metadata ?? null,
        author: template?.author ?? faker.person.fullName(),
        categories: template?.categories ?? [],
        status: template?.status ?? TemplateStatus.PUBLISHED,
    }
}

export const createMockPlan = (plan?: Partial<ProjectPlan>): ProjectPlan => {
    return {
        id: plan?.id ?? ibId(),
        created: plan?.created ?? faker.date.recent().toISOString(),
        updated: plan?.updated ?? faker.date.recent().toISOString(),
        projectId: plan?.projectId ?? ibId(),
        name: plan?.name ?? faker.lorem.word(),
        locked: plan?.locked ?? false,
        blocks: plan?.blocks ?? [],
        blocksFilterType: plan?.blocksFilterType ?? BlocksFilterType.NONE,
    }
}

export const createMockUserInvitation = (userInvitation: Partial<UserInvitation>): UserInvitation => {
    return {
        id: userInvitation.id ?? ibId(),
        created: userInvitation.created ?? faker.date.recent().toISOString(),
        updated: userInvitation.updated ?? faker.date.recent().toISOString(),
        email: userInvitation.email ?? faker.internet.email(),
        type: userInvitation.type ?? faker.helpers.enumValue(InvitationType),
        platformId: userInvitation.platformId ?? ibId(),
        projectId: userInvitation.projectId,
        projectRole: userInvitation.projectRole,
        platformRole: userInvitation.platformRole,
        status: userInvitation.status ?? faker.helpers.enumValue(InvitationStatus),
    }
}

export const createMockProject = (project?: Partial<Project>): Project => {
    const icon: ProjectIcon = {
        color: faker.helpers.enumValue(ColorName),
    }
    return {
        id: project?.id ?? ibId(),
        created: project?.created ?? faker.date.recent().toISOString(),
        updated: project?.updated ?? faker.date.recent().toISOString(),
        deleted: project?.deleted ?? null,
        ownerId: project?.ownerId ?? ibId(),
        displayName: project?.displayName ?? faker.lorem.word(),
        platformId: project?.platformId ?? ibId(),
        externalId: project?.externalId ?? ibId(),
        releasesEnabled: project?.releasesEnabled ?? false,
        metadata: project?.metadata ?? null,
        type: project?.type ?? ProjectType.TEAM,
        poolId: project?.poolId ?? null,
        icon,
    }
}

export const createMockGitRepo = (gitRepo?: Partial<GitRepo>): GitRepo => {
    return {
        id: gitRepo?.id ?? ibId(),
        branchType: faker.helpers.enumValue(GitBranchType),
        created: gitRepo?.created ?? faker.date.recent().toISOString(),
        updated: gitRepo?.updated ?? faker.date.recent().toISOString(),
        projectId: gitRepo?.projectId ?? ibId(),
        remoteUrl: gitRepo?.remoteUrl ?? `git@${faker.internet.url()}`,
        sshPrivateKey: gitRepo?.sshPrivateKey ?? faker.internet.password(),
        branch: gitRepo?.branch ?? faker.lorem.word(),
        slug: gitRepo?.slug ?? faker.lorem.word(),
    }
}

export const createMockPlatformPlan = (platformPlan?: Partial<PlatformPlan>): PlatformPlan => {
    return {
        id: platformPlan?.id ?? ibId(),
        created: platformPlan?.created ?? faker.date.recent().toISOString(),
        updated: platformPlan?.updated ?? faker.date.recent().toISOString(),
        platformId: platformPlan?.platformId ?? ibId(),
        tablesEnabled: platformPlan?.tablesEnabled ?? false,
        includedAiCredits: platformPlan?.includedAiCredits ?? 0,
        licenseKey: platformPlan?.licenseKey ?? faker.lorem.word(),
        stripeCustomerId: undefined,
        stripeSubscriptionId: undefined,
        ssoEnabled: platformPlan?.ssoEnabled ?? false,
        eventStreamingEnabled: platformPlan?.eventStreamingEnabled ?? false,
        aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED,
        environmentsEnabled: platformPlan?.environmentsEnabled ?? false,
        analyticsEnabled: platformPlan?.analyticsEnabled ?? false,
        auditLogEnabled: platformPlan?.auditLogEnabled ?? false,
        globalConnectionsEnabled: platformPlan?.globalConnectionsEnabled ?? false,
        customRolesEnabled: platformPlan?.customRolesEnabled ?? false,
        manageBlocksEnabled: platformPlan?.manageBlocksEnabled ?? false,
        manageTemplatesEnabled: platformPlan?.manageTemplatesEnabled ?? false,
        customAppearanceEnabled: platformPlan?.customAppearanceEnabled ?? false,
        apiKeysEnabled: platformPlan?.apiKeysEnabled ?? false,
        stripeSubscriptionStatus: undefined,
        showPoweredBy: platformPlan?.showPoweredBy ?? false,
        embeddingEnabled: platformPlan?.embeddingEnabled ?? false,
        agentsEnabled: platformPlan?.agentsEnabled ?? false,
        aiProvidersEnabled: platformPlan?.aiProvidersEnabled ?? false,
        chatEnabled: platformPlan?.chatEnabled ?? false,
        dataManipulationEnabled: platformPlan?.dataManipulationEnabled ?? false,
        teamProjectsLimit: platformPlan?.teamProjectsLimit ?? TeamProjectsLimit.NONE,
        projectRolesEnabled: platformPlan?.projectRolesEnabled ?? false,
        stripeSubscriptionEndDate: ibDayjs().endOf('month').unix(),
        stripeSubscriptionStartDate: ibDayjs().startOf('month').unix(),
        plan: platformPlan?.plan,
        secretManagersEnabled: platformPlan?.secretManagersEnabled ?? false,
        scimEnabled: platformPlan?.scimEnabled ?? false,
        canary: platformPlan?.canary ?? false,
        customDomainsEnabled: false,
    }
}
export const createMockPlatform = (platform?: Partial<Platform>): Platform => {
    return {
        id: platform?.id ?? ibId(),
        created: platform?.created ?? faker.date.recent().toISOString(),
        updated: platform?.updated ?? faker.date.recent().toISOString(),
        ownerId: platform?.ownerId ?? ibId(),
        enforceAllowedAuthDomains: platform?.enforceAllowedAuthDomains ?? false,
        federatedAuthProviders: platform?.federatedAuthProviders ?? { saml: null },
        allowedAuthDomains: platform?.allowedAuthDomains ?? [],
        allowedEmbedOrigins: platform?.allowedEmbedOrigins ?? [],
        name: platform?.name ?? faker.lorem.word(),
        primaryColor: platform?.primaryColor ?? faker.color.rgb(),
        logoIconUrl: platform?.logoIconUrl ?? faker.image.urlPlaceholder(),
        fullLogoUrl: platform?.fullLogoUrl ?? faker.image.urlPlaceholder(),
        emailAuthEnabled: platform?.emailAuthEnabled ?? faker.datatype.boolean(),
        pinnedBlocks: platform?.pinnedBlocks ?? [],
        favIconUrl: platform?.favIconUrl ?? faker.image.urlPlaceholder(),
        filteredBlockNames: platform?.filteredBlockNames ?? [],
        filteredBlockBehavior:
            platform?.filteredBlockBehavior ??
            faker.helpers.enumValue(FilteredBlockBehavior),
        cloudAuthEnabled: platform?.cloudAuthEnabled ?? faker.datatype.boolean(),
        googleAuthEnabled: platform?.googleAuthEnabled ?? true,
        ssoDomain: platform?.ssoDomain ?? null,
        ssoDomainVerification: platform?.ssoDomainVerification ?? null,
    }
}

export const createMockPlatformWithOwner = (
    params?: CreateMockPlatformWithOwnerParams,
): CreateMockPlatformWithOwnerReturn => {
    const mockOwnerId = params?.owner?.id ?? ibId()
    const mockPlatformId = params?.platform?.id ?? ibId()

    const mockUserIdentity = createMockUserIdentity({})

    const mockOwner = createMockUser({
        identityId: mockUserIdentity.id,
        ...params?.owner,
        id: mockOwnerId,
        platformId: mockPlatformId,
        platformRole: PlatformRole.ADMIN,
    })

    const mockPlatform = createMockPlatform({
        ...params?.platform,
        id: mockPlatformId,
        ownerId: mockOwnerId,
    })

    return {
        mockUserIdentity,
        mockPlatform,
        mockOwner,
    }
}

export const createMockProjectMember = (
    projectMember?: Omit<Partial<ProjectMember>, 'projectRoleId'> & {
        projectRoleId: string
    },
): ProjectMember => {
    assertNotNullOrUndefined(projectMember?.userId, 'userId')
    return {
        id: projectMember?.id ?? ibId(),
        created: projectMember?.created ?? faker.date.recent().toISOString(),
        updated: projectMember?.updated ?? faker.date.recent().toISOString(),
        platformId: projectMember?.platformId ?? ibId(),
        projectRoleId: projectMember.projectRoleId,
        userId: projectMember?.userId,
        projectId: projectMember?.projectId ?? ibId(),
    }
}

const MOCK_SIGNING_KEY_PUBLIC_KEY = `-----BEGIN RSA PUBLIC KEY-----
MIICCgKCAgEAlnd5vGP/1bzcndN/yRD+ZTd6tuemxaJd+12bOZ2QCXcTM03AKSp3
NE5QMyIi13PXMg+z1uPowfivPJ4iVTMaW1U00O7JlUduGR0VrG0BCJlfEf852V71
TfE+2+EpMme9Yw6Gs/YAuOwgVwu3n/XF0il3FTIm1oY1a/MA79rv0RSscnIgCaYJ
e86LWm+H6753Si0MIId/ajIfYYIndN6qRIlPsgagdL+kljUSPEiIzmV0POxTltBo
tXL1t7Mu+meJrY85MXG5W8BS05+q6dJql7Cl0UbPK152ziakB+biMI/4hYlaOIBT
3KeOcz/Jg7Zv21Y0tbdrZ5osVrrNpFsCV7PGyQIUDVmmnCHrOEBS2XM5zOHzTxMl
JQh3Db318rB5415zuBTzrO+20++03kH4SwZEEBg1SDAInYwLOWldbTuZuD0Hx7P2
g4a3OqHHVOcAgtsHgmU7/zCgCIETg4KbRdpSsqOm/YJDWWoLDTwvKnH5QHSBacq1
kxbNAUSuLQESkfZq1Dw5+tdBDJr29bxjmiSggyittTYn1B3iHACNoe4zj9sMQQIf
j9mmntXsa/leIwBVspiEOHYZwJOe5+goSd8K1VIQJxC1DVBxB2eHxMvuo3eyJ0HE
DlebIeZy4zrE1LPgRic1kfdemyxvuN3iwZnPGiY79nL1ZNDM3M4ApSMCAwEAAQ==
-----END RSA PUBLIC KEY-----`

export const createMockApiKey = (
    apiKey?: Partial<Omit<ApiKey, 'hashedValue' | 'truncatedValue'>>,
): ApiKey & { value: string } => {
    const { secretHashed, secretTruncated, secret } = generateApiKey()
    return {
        id: apiKey?.id ?? ibId(),
        created: apiKey?.created ?? faker.date.recent().toISOString(),
        updated: apiKey?.updated ?? faker.date.recent().toISOString(),
        displayName: apiKey?.displayName ?? faker.lorem.word(),
        platformId: apiKey?.platformId ?? ibId(),
        hashedValue: secretHashed,
        value: secret,
        truncatedValue: secretTruncated,
    }
}


export const createMockSigningKey = (
    signingKey?: Partial<SigningKey>,
): SigningKey => {
    return {
        id: signingKey?.id ?? ibId(),
        created: signingKey?.created ?? faker.date.recent().toISOString(),
        updated: signingKey?.updated ?? faker.date.recent().toISOString(),
        displayName: signingKey?.displayName ?? faker.lorem.word(),
        platformId: signingKey?.platformId ?? ibId(),
        publicKey: signingKey?.publicKey ?? MOCK_SIGNING_KEY_PUBLIC_KEY,
        algorithm: signingKey?.algorithm ?? KeyAlgorithm.RSA,
    }
}


export const createMockTag = (tag?: Partial<Omit<TagEntitySchema, 'platform'>>): Omit<TagEntitySchema, 'platform'> => {
    return {
        id: tag?.id ?? ibId(),
        created: tag?.created ?? faker.date.recent().toISOString(),
        updated: tag?.updated ?? faker.date.recent().toISOString(),
        platformId: tag?.platformId ?? ibId(),
        name: tag?.name ?? faker.lorem.word(),
    }
}


export const createMockBlockTag = (request: Partial<Omit<BlockTagSchema, 'platform' | 'tag'>>): Omit<BlockTagSchema, 'platform' | 'tag'> => {
    return {
        id: request.id ?? ibId(),
        created: request.created ?? faker.date.recent().toISOString(),
        updated: request.updated ?? faker.date.recent().toISOString(),
        platformId: request.platformId ?? ibId(),
        blockName: request.blockName ?? faker.lorem.word(),
        tagId: request.tagId ?? ibId(),
    }
}

export const createMockBlockMetadata = (
    blockMetadata?: Partial<Omit<BlockMetadataSchema, 'project'>>,
): Omit<BlockMetadataSchema, 'project'> => {
    return {
        id: blockMetadata?.id ?? ibId(),
        projectUsage: 0,
        created: blockMetadata?.created ?? faker.date.recent().toISOString(),
        updated: blockMetadata?.updated ?? faker.date.recent().toISOString(),
        name: blockMetadata?.name ?? faker.lorem.word(),
        displayName: blockMetadata?.displayName ?? faker.lorem.word(),
        logoUrl: blockMetadata?.logoUrl ?? faker.image.urlPlaceholder(),
        description: blockMetadata?.description ?? faker.lorem.sentence(),
        directoryPath: blockMetadata?.directoryPath,
        auth: blockMetadata?.auth,
        authors: blockMetadata?.authors ?? [],
        platformId: blockMetadata?.platformId,
        version: blockMetadata?.version ?? faker.system.semver(),
        minimumSupportedRelease: blockMetadata?.minimumSupportedRelease ?? '0.0.0',
        maximumSupportedRelease: blockMetadata?.maximumSupportedRelease ?? '9.9.9',
        actions: blockMetadata?.actions ?? {},
        triggers: blockMetadata?.triggers ?? {},
        blockType: blockMetadata?.blockType ?? faker.helpers.enumValue(BlockType),
        packageType:
            blockMetadata?.packageType ?? faker.helpers.enumValue(PackageType),
        archiveId: blockMetadata?.archiveId,
        categories: blockMetadata?.categories ?? [],
        contextInfo: blockMetadata?.contextInfo ?? { version: LATEST_CONTEXT_VERSION },
    }
}

export const createAuditEvent = (auditEvent: Partial<ApplicationEvent>) => {
    return {
        id: auditEvent.id ?? ibId(),
        created: auditEvent.created ?? faker.date.recent().toISOString(),
        updated: auditEvent.updated ?? faker.date.recent().toISOString(),
        ip: auditEvent.ip ?? faker.internet.ip(),
        platformId: auditEvent.platformId,
        userId: auditEvent.userId,
        userEmail: auditEvent.userEmail ?? faker.internet.email(),
        action: auditEvent.action ?? faker.helpers.enumValue(ApplicationEventName),
        data: auditEvent.data ?? {},
    }
}

export const createMockOtp = (otp?: Partial<OtpModel>): OtpModel => {
    const now = dayjs()
    const twentyMinutesAgo = now.subtract(5, 'minutes')

    return {
        id: otp?.id ?? ibId(),
        created: otp?.created ?? faker.date.recent().toISOString(),
        updated:
            otp?.updated ??
            faker.date
                .between({ from: twentyMinutesAgo.toDate(), to: now.toDate() })
                .toISOString(),
        type: otp?.type ?? faker.helpers.enumValue(OtpType),
        identityId: otp?.identityId ?? ibId(),
        value:
            otp?.value ?? faker.number.int({ min: 100000, max: 999999 }).toString(),
        state: otp?.state ?? faker.helpers.enumValue(OtpState),
    }
}

export const createMockFlowRun = (flowRun?: Partial<FlowRun>): FlowRun => {
    return {
        id: flowRun?.id ?? ibId(),
        created: flowRun?.created ?? faker.date.recent().toISOString(),
        updated: flowRun?.updated ?? faker.date.recent().toISOString(),
        projectId: flowRun?.projectId ?? ibId(),
        flowId: flowRun?.flowId ?? ibId(),
        tags: flowRun?.tags ?? [],
        steps: {},
        failParentOnFailure: flowRun?.failParentOnFailure ?? false,
        parentRunId: flowRun?.parentRunId ?? undefined,
        flowVersionId: flowRun?.flowVersionId ?? ibId(),
        flowVersion: flowRun?.flowVersion,
        logsFileId: flowRun?.logsFileId ?? null,
        status: flowRun?.status ?? faker.helpers.enumValue(FlowRunStatus),
        startTime: flowRun?.startTime ?? faker.date.recent().toISOString(),
        finishTime: flowRun?.finishTime ?? faker.date.recent().toISOString(),
        environment:
            flowRun?.environment ?? faker.helpers.enumValue(RunEnvironment),
    }
}

export const createMockFlow = (flow?: Partial<Flow>): Flow => {
    return {
        id: flow?.id ?? ibId(),
        created: flow?.created ?? faker.date.recent().toISOString(),
        updated: flow?.updated ?? faker.date.recent().toISOString(),
        projectId: flow?.projectId ?? ibId(),
        status: flow?.status ?? faker.helpers.enumValue(FlowStatus),
        folderId: flow?.folderId ?? null,
        operationStatus: flow?.operationStatus ?? FlowOperationStatus.NONE,
        publishedVersionId: flow?.publishedVersionId ?? null,
        externalId: flow?.externalId ?? ibId(),
    }
}

export const createMockFlowVersion = (
    flowVersion?: Partial<FlowVersion>,
): FlowVersion => {
    const emptyTrigger = {
        type: FlowTriggerType.EMPTY,
        name: 'trigger',
        settings: {},
        valid: false,
        displayName: 'Select Trigger',
        lastUpdatedDate: dayjs().toISOString(),
    } as const

    return {
        id: flowVersion?.id ?? ibId(),
        created: flowVersion?.created ?? faker.date.recent().toISOString(),
        updated: flowVersion?.updated ?? faker.date.recent().toISOString(),
        displayName: flowVersion?.displayName ?? faker.word.words(),
        flowId: flowVersion?.flowId ?? ibId(),
        agentIds: flowVersion?.agentIds ?? [],
        trigger: flowVersion?.trigger ?? emptyTrigger,
        connectionIds: flowVersion?.connectionIds ?? [],
        state: flowVersion?.state ?? faker.helpers.enumValue(FlowVersionState),
        updatedBy: flowVersion?.updatedBy,
        valid: flowVersion?.valid ?? faker.datatype.boolean(),
        notes: flowVersion?.notes ?? [],
        schemaVersion: flowVersion?.schemaVersion ?? LATEST_FLOW_SCHEMA_VERSION,
        backupFiles: flowVersion?.backupFiles ?? null,
    }
}

export const createMockConnection = (connection: Partial<AppConnection>, ownerId: string): AppConnection<AppConnectionType.SECRET_TEXT> => {
    return {
        id: connection?.id ?? ibId(),
        created: connection?.created ?? faker.date.recent().toISOString(),
        updated: connection?.updated ?? faker.date.recent().toISOString(),
        platformId: connection?.platformId ?? ibId(),
        projectIds: connection?.projectIds ?? [],
        blockName: connection?.blockName ?? faker.lorem.word(),
        displayName: connection?.displayName ?? faker.lorem.word(),
        type: AppConnectionType.SECRET_TEXT,
        scope: AppConnectionScope.PROJECT,
        status: AppConnectionStatus.ACTIVE,
        ownerId,
        value: {
            type: AppConnectionType.SECRET_TEXT,
            secret_text: faker.lorem.word(),
        },
        metadata: connection?.metadata ?? {},
        externalId: connection?.externalId ?? ibId(),
        owner: null,
        blockVersion: connection?.blockVersion ?? '0.0.0',
        preSelectForNewProjects: connection?.preSelectForNewProjects ?? false,
    }
}

export const createMockTable = ({ projectId }: { projectId: string }): Table => {
    return {
        id: ibId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        projectId,
        externalId: ibId(),
        name: faker.lorem.word(),
    }
}

export const createMockField = ({ tableId, projectId }: { tableId: string, projectId: string }): Field => {
    return {
        id: ibId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        tableId,
        name: faker.lorem.word(),
        data: {
            options: [],
        },
        externalId: ibId(),
        projectId,
        type: FieldType.STATIC_DROPDOWN,
    }
}
export const createMockRecord = ({ tableId, projectId }: { tableId: string, projectId: string }): Record => {
    return {
        id: ibId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        tableId,
        projectId,
    }
}

export const createMockCell = ({ recordId, fieldId, projectId }: { recordId: string, fieldId: string, projectId: string }): Cell => {
    return {
        id: ibId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        recordId,
        fieldId,
        projectId,
        value: faker.lorem.word(),
    }
}


type Solution = {
    table: Table
    connection: AppConnection<AppConnectionType.SECRET_TEXT>
    flow: Flow
    flowRun: FlowRun
    flowVersion: FlowVersion
    cell: Cell
}

export const createMockSolutionAndSave = async ({ projectId, platformId, userId }: { projectId: string, platformId: string, userId: string }): Promise<Solution> => {
    const table = createMockTable({ projectId })
    const field = createMockField({ tableId: table.id, projectId })
    const record = createMockRecord({ tableId: table.id, projectId })
    const cell = createMockCell({ recordId: record.id, fieldId: field.id, projectId })
    const connection = createMockConnection({ projectIds: [projectId], platformId }, userId)
    const flow = createMockFlow({ projectId })
    const flowVersion = createMockFlowVersion({ flowId: flow.id })
    const flowRun = createMockFlowRun({ projectId, flowId: flow.id, flowVersionId: flowVersion.id })
    await databaseConnection().getRepository('table').save([table])
    await databaseConnection().getRepository('field').save([field])
    await databaseConnection().getRepository('record').save([record])
    await databaseConnection().getRepository('cell').save([cell])
    await databaseConnection().getRepository('app_connection').save([connection])
    await databaseConnection().getRepository('flow').save([flow])
    await databaseConnection().getRepository('flow_version').save([flowVersion])
    await databaseConnection().getRepository('flow_run').save([flowRun])
    return { table, connection, flow, flowRun, flowVersion, cell }
}

export const checkIfSolutionExistsInDb = async (solution: Solution): Promise<boolean> => {
    const table = await databaseConnection().getRepository('table').findOneBy({ id: solution.table.id })
    const connection = await databaseConnection().getRepository('app_connection').findOneBy({ id: solution.connection.id })
    const flow = await databaseConnection().getRepository('flow').findOneBy({ id: solution.flow.id })
    const flowRun = await databaseConnection().getRepository('flow_run').findOneBy({ id: solution.flowRun.id })
    const flowVersion = await databaseConnection().getRepository('flow_version').findOneBy({ id: solution.flowVersion.id })
    const cell = await databaseConnection().getRepository('cell').findOneBy({ id: solution.cell.id })
    return table !== null && connection !== null && flow !== null && flowRun !== null && flowVersion !== null && cell !== null
}
export const mockBasicUser = async ({ userIdentity, user }: { userIdentity?: Partial<UserIdentity>, user?: Partial<User> }) => {
    const mockUserIdentity = createMockUserIdentity({
        verified: true,
        ...userIdentity,
    })
    await databaseConnection().getRepository('user_identity').save(mockUserIdentity)
    const mockUser = createMockUser({
        ...user,
        identityId: mockUserIdentity.id,
    })
    await databaseConnection().getRepository('user').save(mockUser)
    return {
        mockUserIdentity,
        mockUser,
    }
}
export const mockAndSaveBasicSetup = async (params?: MockBasicSetupParams): Promise<MockBasicSetup> => {
    const mockUserIdentity = createMockUserIdentity({
        verified: true,
        ...params?.userIdentity,
    })
    await databaseConnection().getRepository('user_identity').save(mockUserIdentity)

    const mockOwner = createMockUser({
        ...params?.user,
        identityId: mockUserIdentity.id,
        platformRole: PlatformRole.ADMIN,
    })
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockPlatform = createMockPlatform({
        ...params?.platform,
        ownerId: mockOwner.id,
        filteredBlockBehavior: params?.platform?.filteredBlockBehavior ?? FilteredBlockBehavior.BLOCKED,
    })

    await databaseConnection().getRepository('platform').save(mockPlatform)
    const hasPlanTable = databaseConnection().hasMetadata(PlatformPlanEntity)
    if (hasPlanTable) {
        const mockPlatformPlan = createMockPlatformPlan({
            platformId: mockPlatform.id,
            auditLogEnabled: true,
            apiKeysEnabled: true,
            customRolesEnabled: true,
            teamProjectsLimit: TeamProjectsLimit.UNLIMITED,
            includedAiCredits: 1000,
            ...params?.plan,
        })
        await databaseConnection().getRepository('platform_plan').upsert(mockPlatformPlan, ['platformId'])
    }

    mockOwner.platformId = mockPlatform.id
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockProject = createMockProject({
        ...params?.project,
        ownerId: mockOwner.id,
        platformId: mockPlatform.id,
    })
    await databaseConnection().getRepository('project').save(mockProject)

    return {
        mockUserIdentity,
        mockOwner,
        mockPlatform,
        mockProject,
    }
}

type MockBasicSetupWithApiKey = MockBasicSetup & { mockApiKey: ApiKey & { value: string } }
export const mockAndSaveBasicSetupWithApiKey = async (params?: MockBasicSetupParams): Promise<MockBasicSetupWithApiKey> => {
    const basicSetup = await mockAndSaveBasicSetup(params)

    const mockApiKey = createMockApiKey({
        platformId: basicSetup.mockPlatform.id,
    })
    await databaseConnection().getRepository('api_key').save(mockApiKey)

    return {
        ...basicSetup,
        mockApiKey,
    }
}

export const createMockFile = (file?: Partial<File>): File => {
    const hasExplicitProjectId = file !== undefined && 'projectId' in file
    const hasExplicitPlatformId = file !== undefined && 'platformId' in file
    return {
        id: file?.id ?? ibId(),
        created: file?.created ?? faker.date.recent().toISOString(),
        updated: file?.updated ?? faker.date.recent().toISOString(),
        platformId: hasExplicitPlatformId ? (file?.platformId ?? null) : ibId(),
        projectId: hasExplicitProjectId ? (file?.projectId ?? null) : ibId(),
        location: file?.location ?? FileLocation.DB,
        compression: file?.compression ?? faker.helpers.enumValue(FileCompression),
        data: file?.data ?? Buffer.from(faker.lorem.paragraphs()),
        type: file?.type ?? faker.helpers.enumValue(FileType),
        fileName: file?.fileName ?? null,
        metadata: file?.metadata ?? null,
        s3Key: file?.s3Key ?? null,
        size: file?.size ?? null,
    }
}

export const createMockProjectRole = (projectRole?: Partial<ProjectRole>): ProjectRole => {
    return {
        id: projectRole?.id ?? ibId(),
        name: projectRole?.name ?? faker.lorem.word(),
        created: projectRole?.created ?? faker.date.recent().toISOString(),
        updated: projectRole?.updated ?? faker.date.recent().toISOString(),
        permissions: projectRole?.permissions ?? [],
        platformId: projectRole?.platformId ?? ibId(),
        type: projectRole?.type ?? faker.helpers.enumValue(RoleType),
    }
}

export const createMockProjectRelease = (projectRelease?: Partial<ProjectRelease>): ProjectRelease => {
    return {
        id: projectRelease?.id ?? ibId(),
        created: projectRelease?.created ?? faker.date.recent().toISOString(),
        updated: projectRelease?.updated ?? faker.date.recent().toISOString(),
        projectId: projectRelease?.projectId ?? ibId(),
        importedBy: projectRelease?.importedBy ?? ibId(),
        fileId: projectRelease?.fileId ?? ibId(),
        name: projectRelease?.name ?? faker.lorem.word(),
        description: projectRelease?.description ?? faker.lorem.sentence(),
        type: projectRelease?.type ?? faker.helpers.enumValue(ProjectReleaseType),
    }
}

export const createMockAIProvider = async (aiProvider?: Partial<AIProvider>): Promise<Omit<AIProviderSchema, 'platform'>> => {
    return {
        id: aiProvider?.id ?? ibId(),
        created: aiProvider?.created ?? faker.date.recent().toISOString(),
        updated: aiProvider?.updated ?? faker.date.recent().toISOString(),
        platformId: aiProvider?.platformId ?? ibId(),
        provider: aiProvider?.provider ?? faker.helpers.enumValue(AIProviderName),
        displayName: aiProvider?.displayName ?? faker.lorem.word(),
        auth: await encryptUtils.encryptObject({
            apiKey: process.env.OPENAI_API_KEY ?? faker.string.uuid(),
        }),
        config: aiProvider?.config ?? {},
        enabledForChat: aiProvider?.provider === AIProviderName.INTELLISPER ? true : false,
    }

}

export const mockAndSaveAIProvider = async (params?: Partial<AIProvider>): Promise<Omit<AIProviderSchema, 'platform'>> => {
    const mockAIProvider = await createMockAIProvider(params)
    await databaseConnection().getRepository('ai_provider').upsert(mockAIProvider, ['platformId', 'provider'])
    return mockAIProvider
}

export const mockBlockMetadata = async (mockLog: FastifyBaseLogger): Promise<BlockMetadata> => {
    const { mockPlatform } = await mockAndSaveBasicSetup()
    const mockBlockMetadata = createMockBlockMetadata({
        platformId: mockPlatform.id,
        packageType: PackageType.REGISTRY,
    })
    await databaseConnection().getRepository('block_metadata').save([mockBlockMetadata])
    blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockBlockMetadata)
    return mockBlockMetadata
}

export const createMockFolder = (folder?: Partial<Folder>): Folder => {
    return {
        id: folder?.id ?? ibId(),
        created: folder?.created ?? faker.date.recent().toISOString(),
        updated: folder?.updated ?? faker.date.recent().toISOString(),
        projectId: folder?.projectId ?? ibId(),
        displayName: folder?.displayName ?? faker.lorem.word(),
        displayOrder: folder?.displayOrder ?? faker.number.int({ min: 0, max: 100 }),
    }
}

export const createMockEventDestination = (eventDestination?: Partial<{
    id: string
    created: string
    updated: string
    platformId: string
    projectId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
}>): {
    id: string
    created: string
    updated: string
    platformId: string
    projectId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
} => {
    return {
        id: eventDestination?.id ?? ibId(),
        created: eventDestination?.created ?? faker.date.recent().toISOString(),
        updated: eventDestination?.updated ?? faker.date.recent().toISOString(),
        platformId: eventDestination?.platformId ?? ibId(),
        projectId: eventDestination?.projectId ?? null,
        events: eventDestination?.events ?? [faker.helpers.enumValue(ApplicationEventName)],
        url: eventDestination?.url ?? faker.internet.url(),
        scope: eventDestination?.scope ?? EventDestinationScope.PLATFORM,
    }
}

type CreateMockPlatformWithOwnerParams = {
    platform?: Partial<Omit<Platform, 'ownerId'>>
    owner?: Partial<Omit<User, 'platformId'>>
}

type CreateMockPlatformWithOwnerReturn = {
    mockPlatform: Platform
    mockOwner: User
    mockUserIdentity: UserIdentity
}


type MockBasicSetup = {
    mockOwner: User
    mockPlatform: Platform
    mockProject: Project
    mockUserIdentity: UserIdentity
}

type MockBasicSetupParams = {
    userIdentity?: Partial<UserIdentity>
    user?: Partial<User>
    plan?: Partial<PlatformPlan>
    platform?: Partial<Platform>
    project?: Partial<Project>
}
