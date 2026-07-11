import type { PlatformId } from '../../../management/platform'
import type { ProjectId } from '../../../management/project'
import type { IbId } from '../../common/id-generator'
import { PrincipalType } from './principal-type'

export type WorkerPrincipal = {
    id: IbId
    type: PrincipalType.WORKER
}

export type AnnonymousPrincipal = {
    id: IbId
    type: PrincipalType.UNKNOWN
}

export type ServicePrincipal = {
    id: IbId
    type: PrincipalType.SERVICE
    platform: {
        id: IbId
    }
}

export type UserPrincipal = {
    id: IbId
    type: PrincipalType.USER
    platform: {
        id: IbId
    }
    tokenVersion?: string
}

export type EnginePrincipal = {
    id: IbId
    type: PrincipalType.ENGINE
    projectId: ProjectId
    platform: {
        id: PlatformId
    }
}


export type OnboardingPrincipal = {
    id: IbId
    type: PrincipalType.ONBOARDING
    tokenVersion?: string
}

export type PrincipalForType<T extends PrincipalType> = Extract<Principal, { type: T }>

export type PrincipalForTypes<R extends readonly PrincipalType[]> = PrincipalForType<R[number]>

export type Principal =
    | WorkerPrincipal
    | AnnonymousPrincipal
    | ServicePrincipal
    | UserPrincipal
    | EnginePrincipal
    | OnboardingPrincipal
