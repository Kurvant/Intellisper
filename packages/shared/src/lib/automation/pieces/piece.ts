import { z } from 'zod'

export enum PackageType {
    ARCHIVE = 'ARCHIVE',
    REGISTRY = 'REGISTRY',
}

export enum BlockType {
    CUSTOM = 'CUSTOM',
    OFFICIAL = 'OFFICIAL',
}

export const PrivateBlockPackage = z.object({
    packageType: z.literal(PackageType.ARCHIVE),
    blockType: z.nativeEnum(BlockType),
    blockName: z.string(),
    blockVersion: z.string(),
    archiveId: z.string(),
    platformId: z.string(),
})

export type PrivateBlockPackage = z.infer<typeof PrivateBlockPackage>

export const OfficialBlockPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    blockType: z.literal(BlockType.OFFICIAL),
    blockName: z.string(),
    blockVersion: z.string(),
})

export type OfficialBlockPackage = z.infer<typeof OfficialBlockPackage>

export const CustomNpmBlockPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    blockType: z.literal(BlockType.CUSTOM),
    blockName: z.string(),
    blockVersion: z.string(),
    platformId: z.string(),
})

export type CustomNpmBlockPackage = z.infer<typeof CustomNpmBlockPackage>

export const PublicBlockPackage = z.union([OfficialBlockPackage, CustomNpmBlockPackage])
export type PublicBlockPackage = OfficialBlockPackage | CustomNpmBlockPackage

export const BlockPackage = z.union([PrivateBlockPackage, OfficialBlockPackage, CustomNpmBlockPackage])
export type BlockPackage = PrivateBlockPackage | OfficialBlockPackage | CustomNpmBlockPackage

export enum BlockCategory {
    ARTIFICIAL_INTELLIGENCE = 'ARTIFICIAL_INTELLIGENCE',
    COMMUNICATION = 'COMMUNICATION',
    COMMERCE = 'COMMERCE',
    CORE = 'CORE',
    UNIVERSAL_AI = 'UNIVERSAL_AI',
    FLOW_CONTROL = 'FLOW_CONTROL',
    BUSINESS_INTELLIGENCE = 'BUSINESS_INTELLIGENCE',
    ACCOUNTING = 'ACCOUNTING',
    PRODUCTIVITY = 'PRODUCTIVITY',
    CONTENT_AND_FILES = 'CONTENT_AND_FILES',
    DEVELOPER_TOOLS = 'DEVELOPER_TOOLS',
    CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
    FORMS_AND_SURVEYS = 'FORMS_AND_SURVEYS',
    HUMAN_RESOURCES = 'HUMAN_RESOURCES',
    PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
    MARKETING = 'MARKETING',
    SALES_AND_CRM = 'SALES_AND_CRM',
}
