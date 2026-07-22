import { z } from 'zod'
import { IbMultipartFile } from '../../../core/common'
import { OptionalArrayFromQuery, OptionalBooleanFromQuery } from '../../../core/common/base-model'
import { IbEdition } from '../../../core/flag/flag'
import { BlockCategory, PackageType } from '../piece'

export const EXACT_VERSION_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+$'
export const EXACT_VERSION_REGEX = new RegExp(EXACT_VERSION_PATTERN)
const VERSION_PATTERN = '^([~^])?[0-9]+\\.[0-9]+\\.[0-9]+$'

export const ExactVersionType = z.string().regex(new RegExp(EXACT_VERSION_PATTERN))

export const VersionType = z.string().regex(new RegExp(VERSION_PATTERN))

export enum SuggestionType {
    ACTION = 'ACTION',
    TRIGGER = 'TRIGGER',
    ACTION_AND_TRIGGER = 'ACTION_AND_TRIGGER',
}
export enum BlockSortBy {
    NAME = 'NAME',
    UPDATED = 'UPDATED',
    CREATED = 'CREATED',
    POPULARITY = 'POPULARITY',
}

export enum BlockOrderBy {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const GetBlockRequestWithScopeParams = z.object({
    name: z.string(),
    scope: z.string(),
})

export type GetBlockRequestWithScopeParams = z.infer<typeof GetBlockRequestWithScopeParams>


export const GetBlockRequestParams = z.object({
    name: z.string(),
})

export type GetBlockRequestParams = z.infer<typeof GetBlockRequestParams>

export const ListBlocksRequestQuery = z.object({
    projectId: z.string().optional(),
    release: ExactVersionType.optional(),
    includeTags: OptionalBooleanFromQuery,
    includeHidden: OptionalBooleanFromQuery,
    edition: z.nativeEnum(IbEdition).optional(),
    searchQuery: z.string().optional(),
    sortBy: z.nativeEnum(BlockSortBy).optional(),
    orderBy: z.nativeEnum(BlockOrderBy).optional(),
    categories: OptionalArrayFromQuery(z.nativeEnum(BlockCategory)),
    suggestionType: z.nativeEnum(SuggestionType).optional(),
    locale: z.string().optional(),
})

export type ListBlocksRequestQuery = z.infer<typeof ListBlocksRequestQuery>


export const RegistryBlocksRequestQuery = z.object({
    release: ExactVersionType,
    edition: z.nativeEnum(IbEdition),
})

export type RegistryBlocksRequestQuery = z.infer<typeof RegistryBlocksRequestQuery>

export const GetBlockRequestQuery = z.object({
    version: VersionType.optional(),
    projectId: z.string().optional(),
    locale: z.string().optional(),
})

export type GetBlockRequestQuery = z.infer<typeof GetBlockRequestQuery>

export const BlockOptionRequest = z.object({
    projectId: z.string(),
    blockName: z.string(),
    blockVersion: VersionType,
    actionOrTriggerName: z.string(),
    propertyName: z.string(),
    flowId: z.string(),
    flowVersionId: z.string(),
    input: z.any(),
    searchValue: z.string().optional(),
})

export type BlockOptionRequest = z.infer<typeof BlockOptionRequest>

export enum BlockScope {
    PLATFORM = 'PLATFORM',
}

export const AddBlockRequestBody = z.union([
    z.object({
        packageType: z.literal(PackageType.ARCHIVE),
        scope: z.literal(BlockScope.PLATFORM),
        blockName: z.string().min(1),
        blockVersion: ExactVersionType,
        blockArchive: IbMultipartFile,
    }).describe('Private Block'),
    z.object({
        packageType: z.literal(PackageType.REGISTRY),
        scope: z.literal(BlockScope.PLATFORM),
        blockName: z.string().min(1),
        blockVersion: ExactVersionType,
    }).describe('NPM Block'),
])

export type AddBlockRequestBody = z.infer<typeof AddBlockRequestBody>

