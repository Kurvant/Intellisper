import type { ProjectId } from '../../management/project/project'
import type { BaseModel } from '../common/base-model'
import type { IbId } from '../common/id-generator'

export type StoreEntryId = IbId

export const STORE_KEY_MAX_LENGTH = 128
export const STORE_VALUE_MAX_SIZE = 512 * 1024

export type StoreEntry = {
    key: string
    projectId: ProjectId
    value: unknown
} & BaseModel<StoreEntryId>