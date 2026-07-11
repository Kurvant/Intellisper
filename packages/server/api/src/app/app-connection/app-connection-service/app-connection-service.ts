import {
    IntellisperError,
    IbEdition,
    IbEnvironment,
    ibId,
    AppConnection,
    AppConnectionId,
    AppConnectionOwners,
    AppConnectionScope,
    AppConnectionStatus,
    AppConnectionType,
    AppConnectionValue,
    AppConnectionWithoutSensitiveData,
    ConnectionState,
    Cursor,
    EngineResponse,
    EngineResponseStatus,
    ErrorCode,
    ExecuteValidateAuthResponse,
    isNil,
    MAX_PLATFORM_APP_CONNECTION_OWNERS,
    Metadata,
    OAuth2GrantType,
    PlatformAppConnectionOwner,
    PlatformAppConnectionOwnersResponse,
    PlatformAppConnectionProjectInfo,
    PlatformAppConnectionsListItem,
    PlatformId,
    PlatformRole,
    ProjectId,
    SeekPage,
    spreadIfDefined,
    unique,
    UpsertAppConnectionRequestBody,
    User,
    UserId,
    UserIdentity,
    UserWithMetaInformation,
    WorkerJobType,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { ArrayContains, Equal, FindOperator, FindOptionsWhere, ILike, In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { projectMemberService } from '../../enterprise/projects/project-members/project-member.service'
import { containsSecretManagerReference, secretManagersService } from '../../enterprise/secret-managers/secret-managers.service'
import { flowService } from '../../flows/flow/flow.service'
import { encryptUtils } from '../../helper/encryption'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import {
    getBlockPackageWithoutArchive,
    blockMetadataService,
} from '../../pieces/metadata/piece-metadata-service'
import { projectRepo } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import {
    AppConnectionEntity,
    AppConnectionSchema,
} from '../app-connection.entity'
import { appConnectionHandler } from './app-connection.handler'
import { oauth2Handler } from './oauth2'
import { oauth2Util } from './oauth2/oauth2-util'
export const appConnectionsRepo = repoFactory(AppConnectionEntity)

export const appConnectionService = (log: FastifyBaseLogger) => ({
    async upsert(params: UpsertParams): Promise<AppConnectionWithoutSensitiveData> {
        const { projectIds, externalId, value, displayName, blockName, ownerId, platformId, scope, type, status, metadata, preSelectForNewProjects } = params
        const blockVersion = params.blockVersion ?? ( await blockMetadataService(log).getOrThrow({
            name: blockName,
            platformId,
        })).version
        validateBlockVersion(blockVersion)
        await assertProjectIds(projectIds, platformId)

        if (status === AppConnectionStatus.MISSING) {
            const existingForPlaceholder = await appConnectionsRepo().findOneBy({
                externalId,
                scope,
                platformId,
                ...(projectIds ? { projectIds: ArrayContains(projectIds) } : {}),
            })
            if (!isNil(existingForPlaceholder) && existingForPlaceholder.status !== AppConnectionStatus.MISSING) {
                log.info({ connectionId: existingForPlaceholder.id, blockName, platformId, existingStatus: existingForPlaceholder.status }, 'Placeholder upsert skipped — non-missing connection already exists')
                return this.removeSensitiveData(existingForPlaceholder)
            }
        }

        const validatedConnectionValue = await validateConnectionValue({
            value: await secretManagersService(log).resolveObject({ value, platformId, projectIds }),
            blockName,
            blockVersion,
            projectId: projectIds[0],
            platformId,
        }, log)

        const encryptedConnectionValue = await encryptUtils.encryptObject({
            ...validatedConnectionValue,
            ...value,
        })

        const existingConnection = await appConnectionsRepo().findOneBy({
            externalId,
            scope,
            platformId,
            ...(projectIds ? { projectIds: ArrayContains(projectIds) } : {}),
        })

        const newId = existingConnection?.id ?? ibId()
        const connection = {
            displayName,
            ...spreadIfDefined('ownerId', ownerId),
            status: status ?? AppConnectionStatus.ACTIVE,
            value: encryptedConnectionValue,
            externalId,
            blockName,
            type,
            id: newId,
            scope,
            projectIds,
            platformId,
            ...spreadIfDefined('metadata', metadata),
            ...spreadIfDefined('preSelectForNewProjects', preSelectForNewProjects),
            blockVersion,
        }

        await appConnectionsRepo().upsert(connection, ['id'])

        const updatedConnection = await appConnectionsRepo().findOneByOrFail({
            id: newId,
            platformId,
            ...(projectIds ? { projectIds: ArrayContains(projectIds) } : {}),
            scope,
        })
        log.info({ connectionId: newId, blockName, platformId, isNew: isNil(existingConnection) }, 'App connection upserted')
        return this.removeSensitiveData(updatedConnection)
    },
    async update(params: UpdateParams): Promise<AppConnectionWithoutSensitiveData> {
        const { projectIds, id, request, scope, platformId } = params

        if (!isNil(request.projectIds)) {
            await assertProjectIds(request.projectIds, platformId)
        }

        const filter: FindOptionsWhere<AppConnectionSchema> = {
            id,
            scope,
            platformId,
            ...(projectIds ? { projectIds: ArrayContains(projectIds) } : {}),
        }

        await appConnectionsRepo().update(filter, {
            displayName: request.displayName,
            ...spreadIfDefined('projectIds', request.projectIds),
            ...spreadIfDefined('metadata', request.metadata),
            ...spreadIfDefined('preSelectForNewProjects', request.preSelectForNewProjects),
        })

        const updatedConnection = await appConnectionsRepo().findOneByOrFail(filter)
        return this.removeSensitiveData(updatedConnection)
    },
    async getOne({
        projectId,
        platformId,
        externalId,
    }: GetOneByName): Promise<AppConnection | null> {
        const encryptedAppConnection = await appConnectionsRepo().findOne({
            where: {
                projectIds: ArrayContains([projectId]),
                externalId,
                platformId,
            },
        })

        if (isNil(encryptedAppConnection)) {
            return null
        }
        const connection = await this.decryptAndRefreshConnection(encryptedAppConnection, projectId, log)

        if (isNil(connection)) {
            return null
        }

        const owner = isNil(connection.ownerId) ? null : await userService(log).getMetaInformation({
            id: connection.ownerId,
        })
        return {
            ...connection,
            owner,
        }
    },

    async getOneOrThrowWithoutValue(params: GetOneParams): Promise<AppConnectionWithoutSensitiveData> {
        const connectionById = await appConnectionsRepo().findOneBy({
            id: params.id,
            platformId: params.platformId,
            ...(params.projectId ? { projectIds: ArrayContains([params.projectId]) } : {}),
        })
        if (isNil(connectionById)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'AppConnection',
                    entityId: params.id,
                },
            })
        }
        return this.removeSensitiveData(connectionById)
    },

    async getManyConnectionStates(params: GetManyParams): Promise<ConnectionState[]> {
        const connections = await appConnectionsRepo().find({
            where: {
                projectIds: ArrayContains([params.projectId]),
            },
        })
        return connections.map((connection) => ({
            externalId: connection.externalId,
            blockName: connection.blockName,
            displayName: connection.displayName,
        }))
    },

    // Reconcile which organization-shared (PLATFORM-scoped) connections a workspace is
    // attached to, from a target set of connection external ids (spec E.1). Connections are
    // matched by external id **within the caller's platform only** — a connection on another
    // platform is never touched. The workspace id is added to newly-selected connections'
    // projectIds (idempotently — no duplicates) and removed from connections that are no
    // longer selected. Used by workspace establishment/update (I.5); the caller applies the
    // shared-connections entitlement gate before invoking this.
    async reconcileProjectGlobalConnections(params: ReconcileGlobalConnectionsParams): Promise<void> {
        const { platformId, projectId, connectionExternalIds } = params
        const targetExternalIds = new Set(connectionExternalIds)
        const platformConnections = await appConnectionsRepo().findBy({
            platformId,
            scope: AppConnectionScope.PLATFORM,
        })
        for (const connection of platformConnections) {
            const currentProjectIds = connection.projectIds ?? []
            const isSelected = targetExternalIds.has(connection.externalId)
            const isAttached = currentProjectIds.includes(projectId)
            if (isSelected && !isAttached) {
                await appConnectionsRepo().update(connection.id, {
                    projectIds: [...currentProjectIds, projectId],
                })
            }
            else if (!isSelected && isAttached) {
                await appConnectionsRepo().update(connection.id, {
                    projectIds: currentProjectIds.filter((id) => id !== projectId),
                })
            }
        }
    },

    async replace(params: ReplaceParams): Promise<void> {
        const { sourceAppConnectionId, targetAppConnectionId, projectId, platformId, userId } = params
        const sourceAppConnection = await this.getOneOrThrowWithoutValue({
            id: sourceAppConnectionId,
            projectId,
            platformId,
        })
        
        const targetAppConnection = await this.getOneOrThrowWithoutValue({
            id: targetAppConnectionId,
            projectId,
            platformId,
        })
        
        if (sourceAppConnection.blockName !== targetAppConnection.blockName) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Connections must be from the same app',
                },
            })
        }

        const flows = await flowService(log).list({
            projectIds: [projectId],
            cursorRequest: null,
            limit: 1000,
            folderId: undefined,
            name: undefined,
            status: undefined,
            connectionExternalIds: [sourceAppConnection.externalId],
        })

        await appConnectionHandler(log).updateFlowsWithAppConnection(flows.data, {
            appConnection: sourceAppConnection,
            newAppConnection: targetAppConnection,
            userId,
        })

        log.info({ oldConnectionId: sourceAppConnectionId, newConnectionId: targetAppConnectionId, affectedFlows: flows.data.length }, 'App connection replaced')
        await this.delete({
            id: sourceAppConnection.id,
            platformId,
            scope: sourceAppConnection.scope,
            projectId,
        })
    },

    async delete(params: DeleteParams): Promise<void> {
        await appConnectionsRepo().delete({
            id: params.id,
            platformId: params.platformId,
            scope: params.scope,
            ...(params.projectId ? { projectIds: ArrayContains([params.projectId]) } : {}),
        })
        log.info({ connectionId: params.id, platformId: params.platformId }, 'App connection deleted')
    },

    async list({
        projectId,
        projectIds,
        ownerIds,
        blockName,
        cursorRequest,
        displayName,
        status,
        limit,
        scope,
        platformId,
        externalIds,
    }: ListParams): Promise<SeekPage<AppConnection>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: AppConnectionEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const querySelector: Record<string, string | FindOperator<string>> = {
            ...(projectId ? { projectIds: ArrayContains([projectId]) } : {}),
            ...spreadIfDefined('scope', scope),
            platformId,
        }
        if (!isNil(blockName)) {
            querySelector.blockName = Equal(blockName)
        }
        if (!isNil(displayName)) {
            querySelector.displayName = ILike(`%${displayName}%`)
        }
        if (!isNil(status)) {
            querySelector.status = In(status)
        }
        if (!isNil(externalIds)) {
            querySelector.externalId = In(externalIds)
        }
        if (!isNil(ownerIds) && ownerIds.length > 0) {
            querySelector.ownerId = In(ownerIds)
        }
        const queryBuilder = appConnectionsRepo()
            .createQueryBuilder('app_connection')
            .leftJoinAndSelect('app_connection.owner', 'owner')
            .leftJoinAndSelect('owner.identity', 'owner_identity')
            .where(querySelector)
        if (!isNil(projectIds) && projectIds.length > 0) {
            queryBuilder.andWhere('app_connection."projectIds" && :projectIds::varchar[]', { projectIds })
        }
        const { data, cursor } = await paginator.paginate(queryBuilder)

        const flowIdsByExternalId = await fetchFlowIdsForConnections(log, data)

        const promises = data.map(async (encryptedConnection) => {
            const apConnection: AppConnection = await appConnectionHandler(log).decryptConnection(encryptedConnection)
            const owner = mapToUserWithMetaInformation(encryptedConnection.owner)
            const flowIds = flowIdsByExternalId.get(apConnection.externalId) ?? []

            return {
                ...apConnection,
                owner,
                flowIds,
            }
        })
        const refreshConnections = await Promise.all(promises)

        return paginationHelper.createPage<AppConnection>(
            refreshConnections,
            cursor,
        )
    },
    removeSensitiveData: (
        appConnection: AppConnection | AppConnectionSchema,
    ): AppConnectionWithoutSensitiveData => {
        const { value, ...appConnectionWithoutSensitiveData } = appConnection
        return {
            ...appConnectionWithoutSensitiveData,
            usingSecretManager: containsSecretManagerReference(value),
        }
    },

    async decryptAndRefreshConnection(
        encryptedAppConnection: AppConnectionSchema,
        projectId: ProjectId,
        log: FastifyBaseLogger,
    ): Promise<AppConnection | null> {
        const appConnection = await appConnectionHandler(log).decryptConnection(encryptedAppConnection)
        if (!appConnectionHandler(log).needRefresh(appConnection, log)) {
            return oauth2Util(log).removeRefreshTokenAndClientSecret(appConnection)
        }

        const refreshedConnection = await appConnectionHandler(log).lockAndRefreshConnection({ projectId, externalId: appConnection.externalId, log })
        if (isNil(refreshedConnection)) {
            return null
        }
        return oauth2Util(log).removeRefreshTokenAndClientSecret(refreshedConnection)
    },
    async deleteAllProjectConnections(projectId: string) {
        await appConnectionsRepo().delete({
            scope: AppConnectionScope.PROJECT,
            projectIds: ArrayContains([projectId]),
        })
    },

    async getOwners({ projectId, platformId }: { projectId: ProjectId, platformId: PlatformId }): Promise<AppConnectionOwners[]> {
        const platformAdmins = (await userService(log).getByPlatformRole(platformId, PlatformRole.ADMIN)).map(user => ({
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            email: user.identity.email,
        }))
        const edition = system.getOrThrow(AppSystemProp.EDITION)
        if (edition === IbEdition.COMMUNITY) {
            return platformAdmins
        }
        const projectMembers = await projectMemberService(log).list({
            platformId,
            projectId,
            cursorRequest: null,
            limit: 1000,
            projectRoleId: undefined,
        })
        const projectMembersDetails = projectMembers.data.map(pm => ({
            firstName: pm.user.firstName,
            lastName: pm.user.lastName,
            email: pm.user.email,
        }))
        return [...platformAdmins, ...projectMembersDetails]
    },

    async listForPlatform(params: ListForPlatformParams): Promise<SeekPage<PlatformAppConnectionsListItem>> {
        const service = appConnectionService(log)
        const page = await service.list({
            blockName: params.blockName,
            displayName: params.displayName,
            status: params.status,
            scope: params.scope,
            platformId: params.platformId,
            projectId: null,
            projectIds: params.projectIds,
            ownerIds: params.ownerIds,
            cursorRequest: params.cursorRequest,
            limit: params.limit,
            externalIds: undefined,
        })

        const projectIdsToLookUp = unique(page.data.flatMap((connection) => connection.projectIds))
        const projectsById = await fetchProjectsForPlatform(projectIdsToLookUp, params.platformId)

        const data: PlatformAppConnectionsListItem[] = page.data.map((connection) => {
            const sanitized = service.removeSensitiveData(connection)
            const projects: PlatformAppConnectionProjectInfo[] = connection.projectIds
                .map((id) => projectsById.get(id))
                .filter((project): project is PlatformAppConnectionProjectInfo => project !== undefined)
            return { ...sanitized, projects }
        })

        return { ...page, data }
    },

    async listOwnersForPlatform({ platformId }: { platformId: PlatformId }): Promise<PlatformAppConnectionOwnersResponse> {
        const rows = await appConnectionsRepo()
            .createQueryBuilder('app_connection')
            .innerJoin('app_connection.owner', 'owner')
            .innerJoin('owner.identity', 'identity')
            .where('app_connection.platformId = :platformId', { platformId })
            .select('owner.id', 'id')
            .addSelect('identity.firstName', 'firstName')
            .addSelect('identity.lastName', 'lastName')
            .addSelect('identity.email', 'email')
            .distinct(true)
            .orderBy('identity.email', 'ASC')
            .limit(MAX_PLATFORM_APP_CONNECTION_OWNERS + 1)
            .getRawMany<PlatformAppConnectionOwner>()

        const truncated = rows.length > MAX_PLATFORM_APP_CONNECTION_OWNERS
        const data = truncated ? rows.slice(0, MAX_PLATFORM_APP_CONNECTION_OWNERS) : rows
        return { data, truncated }
    },

})

const fetchProjectsForPlatform = async (projectIds: string[], platformId: string): Promise<Map<string, PlatformAppConnectionProjectInfo>> => {
    if (projectIds.length === 0) {
        return new Map()
    }
    const projects = await projectRepo().find({
        where: { id: In(projectIds), platformId },
        select: ['id', 'displayName', 'type'],
    })
    return new Map(projects.map((project) => [project.id, { id: project.id, displayName: project.displayName, type: project.type }]))
}

async function assertProjectIds(projectIds: ProjectId[], platformId: string): Promise<void> {
    const filteredProjects = await projectRepo().countBy({
        id: In(projectIds),
        platformId,
    })
    if (filteredProjects !== projectIds.length) {
        throw new IntellisperError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'Project',
            },
        })
    }
}
const validateConnectionValue = async (
    params: ValidateConnectionValueParams,
    log: FastifyBaseLogger,
): Promise<AppConnectionValue> => {
    const { value, blockName, blockVersion, projectId, platformId } = params

    switch (value.type) {
        case AppConnectionType.PLATFORM_OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                blockName,
                blockVersion,
                platformId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                projectId,
                platformId,
                blockName,
                request: {
                    grantType: OAuth2GrantType.AUTHORIZATION_CODE,
                    code: value.code,
                    tokenUrl,
                    clientId: value.client_id,
                    props: value.props,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                    redirectUrl: value.redirect_url,
                },
            })
        }
        case AppConnectionType.CLOUD_OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                blockName,
                blockVersion,
                platformId,
                props: value.props,
            })
            return oauth2Handler[value.type](log).claim({
                projectId,
                platformId,
                blockName,
                request: {
                    tokenUrl,
                    grantType: OAuth2GrantType.AUTHORIZATION_CODE,
                    code: value.code,
                    props: value.props,
                    clientId: value.client_id,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                },
            })
        }
        case AppConnectionType.OAUTH2: {
            const tokenUrl = await oauth2Util(log).getOAuth2TokenUrl({
                blockName,
                blockVersion,
                platformId,
                props: value.props,
            })
            
            const auth = await oauth2Handler[value.type](log).claim({
                projectId,
                platformId,
                blockName,
                request: {
                    tokenUrl,
                    code: value.code,
                    clientId: value.client_id,
                    props: value.props,
                    grantType: value.grant_type!,
                    redirectUrl: value.redirect_url,
                    clientSecret: value.client_secret,
                    authorizationMethod: value.authorization_method,
                    codeVerifier: value.code_challenge,
                    scope: value.scope,
                },
            })
            await engineValidateAuth({
                blockName,
                projectId,
                platformId,
                auth,
            }, log)
            return auth
        }
        case AppConnectionType.NO_AUTH:
            break
        case AppConnectionType.CUSTOM_AUTH:
        case AppConnectionType.BASIC_AUTH:
        case AppConnectionType.SECRET_TEXT:
            await engineValidateAuth({
                platformId,
                blockName,
                projectId,
                auth: value,
            }, log)
    }

    return value
}

const engineValidateAuth = async (
    params: EngineValidateAuthParams,
    log: FastifyBaseLogger,
): Promise<void> => {
    const environment = system.getOrThrow(AppSystemProp.ENVIRONMENT)
    if (environment === IbEnvironment.TESTING) {
        return
    }
    const { blockName, auth, projectId, platformId } = params

    const blockMetadata = await blockMetadataService(log).getOrThrow({
        name: blockName,
        version: undefined,
        platformId,
    })

    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteValidateAuthResponse>>({
        block: await getBlockPackageWithoutArchive(log, platformId, {
            blockName,
            blockVersion: blockMetadata.version,
        }),
        projectId,
        platformId,
        connectionValue: auth,
        jobType: WorkerJobType.EXECUTE_VALIDATION,
    }, log)

    if (engineResponse.status !== EngineResponseStatus.OK) {
        log.error(
            { engineResponse },
            'Engine validate auth failed',
        )
        throw new IntellisperError({
            code: ErrorCode.ENGINE_OPERATION_FAILURE,
            params: {
                message: 'Failed to run engine validate auth',
                context: engineResponse,
            },
        })
    }

    const validateAuthResult = engineResponse.response

    if (!validateAuthResult.valid) {
        throw new IntellisperError({
            code: ErrorCode.INVALID_APP_CONNECTION,
            params: {
                error: validateAuthResult.error,
            },
        })
    }
}

async function fetchFlowIdsForConnections(
    log: FastifyBaseLogger,
    connections: AppConnectionSchema[],
): Promise<Map<string, string[]>> {
    const allExternalIds = new Set<string>()
    const allProjectIds = new Set<string>()
    
    connections.forEach((connection) => {
        allExternalIds.add(connection.externalId)
        connection.projectIds.forEach((projectId) => {
            allProjectIds.add(projectId)
        })
    })

    if (allExternalIds.size === 0 || allProjectIds.size === 0) {
        return new Map<string, string[]>()
    }

    const flowsPage = await flowService(log).list({
        projectIds: Array.from(allProjectIds),
        cursorRequest: null,
        connectionExternalIds: Array.from(allExternalIds),
    })

    const flowIdsByExternalId = new Map<string, string[]>()
    flowsPage.data.forEach((flow) => {
        if (flow.version?.connectionIds) {
            flow.version.connectionIds.forEach((connectionExternalId) => {
                if (!flowIdsByExternalId.has(connectionExternalId)) {
                    flowIdsByExternalId.set(connectionExternalId, [])
                }
                flowIdsByExternalId.get(connectionExternalId)!.push(flow.id)
            })
        }
    })

    return flowIdsByExternalId
}

function mapToUserWithMetaInformation(owner: (User & { identity?: UserIdentity }) | null): UserWithMetaInformation | null {
    if (isNil(owner)) {
        return null
    }
    const identity = owner.identity
    if (isNil(identity)) {
        return null
    }

    return {
        id: owner.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        platformId: owner.platformId,
        platformRole: owner.platformRole,
        status: owner.status,
        externalId: owner.externalId,
        created: owner.created,
        updated: owner.updated,
    }
}

function validateBlockVersion(blockVersion: string): void {
    if (!semver.valid(blockVersion)) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: {
                message: 'Invalid piece version',
            },
        })
    }
}
type UpsertParams = {
    projectIds: ProjectId[]
    ownerId: string | null
    platformId: string
    scope: AppConnectionScope
    externalId: string
    value: Extract<UpsertAppConnectionRequestBody, { value: unknown }>['value']
    displayName: string
    type: AppConnectionType
    status?: AppConnectionStatus
    blockName: string
    metadata?: Metadata
    blockVersion?: string
    preSelectForNewProjects?: boolean
}


type GetOneByName = {
    projectId: ProjectId
    platformId: string
    externalId: string
}

type GetOneParams = {
    projectId: ProjectId | null
    platformId: string
    id: string
}

type GetManyParams = {
    projectId: ProjectId
}

type ReconcileGlobalConnectionsParams = {
    platformId: string
    projectId: ProjectId
    connectionExternalIds: string[]
}

type DeleteParams = {
    projectId: ProjectId | null
    scope: AppConnectionScope
    id: AppConnectionId
    platformId: string
}

type ValidateConnectionValueParams = {
    value: Extract<UpsertAppConnectionRequestBody, { value: unknown }>['value']
    blockName: string
    blockVersion: string
    projectId: ProjectId | undefined
    platformId: string
}

type ListParams = {
    projectId: ProjectId | null
    projectIds?: ProjectId[]
    ownerIds?: string[]
    platformId: string
    blockName: string | undefined
    cursorRequest: Cursor | null
    scope: AppConnectionScope | undefined
    displayName: string | undefined
    status: AppConnectionStatus[] | undefined
    limit: number
    externalIds: string[] | undefined
}

type ListForPlatformParams = {
    platformId: string
    blockName: string | undefined
    displayName: string | undefined
    status: AppConnectionStatus[] | undefined
    scope: AppConnectionScope | undefined
    projectIds: ProjectId[] | undefined
    ownerIds: string[] | undefined
    cursorRequest: Cursor | null
    limit: number
}

type UpdateParams = {
    projectIds: ProjectId[] | null
    platformId: string
    id: AppConnectionId
    scope: AppConnectionScope
    request: {
        displayName: string
        projectIds: ProjectId[] | null
        metadata?: Metadata
        preSelectForNewProjects?: boolean
    }
}

type EngineValidateAuthParams = {
    blockName: string
    projectId: ProjectId | undefined
    platformId: string
    auth: AppConnectionValue
}

type ReplaceParams = {
    sourceAppConnectionId: AppConnectionId
    targetAppConnectionId: AppConnectionId
    projectId: ProjectId
    platformId: string
    userId: UserId
}

