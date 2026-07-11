import { BlockPropertyMap } from "./property";
import { WebhookRenewConfiguration } from "./trigger/trigger";
import { ErrorHandlingOptionsParam } from "./action/action";
import { BlockAuthProperty } from "./property/authentication";
import { z } from "zod";
import { LocalesEnum, PackageType, BlockCategory, BlockType, TriggerStrategy, TriggerTestStrategy, WebhookHandshakeConfiguration } from "@intelblocks/shared";
import { ContextVersion } from "./context/versioning";
import type { OutputSchema } from "./output-schema";

const I18nForPiece = z.record(z.string(), z.record(z.string(), z.string())).optional();
export type I18nForPiece = Partial<Record<LocalesEnum, Record<string, string>>> | undefined
export const BlockBase = z.object({
  id: z.string().optional(),
  name: z.string(),
  displayName: z.string(),
  logoUrl: z.string(),
  description: z.string(),
  authors: z.array(z.string()),
  platformId: z.string().optional(),
  directoryPath: z.string().optional(),
  auth: z.union([BlockAuthProperty, z.array(BlockAuthProperty)]).optional(),
  version: z.string(),
  categories: z.array(z.nativeEnum(BlockCategory)).optional(),
  minimumSupportedRelease: z.string().optional(),
  maximumSupportedRelease: z.string().optional(),
  i18n: I18nForPiece,
})

export type BlockBase = {
  id?: string;
  name: string;
  displayName: string;
  logoUrl: string;
  description: string;
  platformId?: string;
  authors: string[],
  directoryPath?: string;
  auth?: BlockAuthProperty | BlockAuthProperty[];
  version: string;
  categories?: BlockCategory[];
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  i18n?: Partial<Record<LocalesEnum, Record<string, string>>>
  // this method didn't exist in older version
  getContextInfo: (() => { version: ContextVersion }) | undefined;
}


export const Audience = z.enum(['human', 'ai', 'both'])
export type Audience = z.infer<typeof Audience>

export const AiMetadata = z.object({
  description: z.string().optional(),
  idempotent: z.boolean().optional(),
})
export type AiMetadata = z.infer<typeof AiMetadata>

export const ActionBase = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  props: BlockPropertyMap,
  requireAuth: z.boolean(),
  errorHandlingOptions: ErrorHandlingOptionsParam.optional(),
  outputSchema: z.custom<OutputSchema>().optional(),
  audience: Audience.optional(),
  aiMetadata: AiMetadata.optional(),
})

export type ActionBase = {
  name: string,
  displayName: string,
  description: string,
  props: BlockPropertyMap,
  requireAuth: boolean;
  errorHandlingOptions?: ErrorHandlingOptionsParam;
  outputSchema?: OutputSchema;
  audience?: Audience;
  aiMetadata?: AiMetadata;
}

export const TriggerBase = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  props: BlockPropertyMap,
  errorHandlingOptions: ErrorHandlingOptionsParam.optional(),
  type: z.nativeEnum(TriggerStrategy),
  sampleData: z.unknown(),
  handshakeConfiguration: z.custom<WebhookHandshakeConfiguration>().optional(),
  renewConfiguration: WebhookRenewConfiguration.optional(),
  testStrategy: z.nativeEnum(TriggerTestStrategy),
  outputSchema: z.custom<OutputSchema>().optional(),
  aiMetadata: AiMetadata.optional(),
})
export type TriggerBase = Omit<ActionBase, 'audience'> & {
  type: TriggerStrategy;
  sampleData: unknown,
  handshakeConfiguration?: WebhookHandshakeConfiguration;
  renewConfiguration?: WebhookRenewConfiguration;
  testStrategy: TriggerTestStrategy;
};

export const BlockMetadata = z.object({
  ...BlockBase.shape,
  actions: z.record(z.string(), ActionBase),
  triggers: z.record(z.string(), TriggerBase),
})

export type BlockMetadata = Omit<BlockBase, 'getContextInfo'> & {
  actions: Record<string, ActionBase>;
  triggers: Record<string, TriggerBase>;
  // this property didn't exist in older version
  contextInfo: { version: ContextVersion } | undefined;
};

export const BlockMetadataSummary = z.object({
  ...BlockBase.shape,
  actions: z.number(),
  triggers: z.number(),
  suggestedActions: z.array(TriggerBase).optional(),
  suggestedTriggers: z.array(ActionBase).optional(),
})
export type BlockMetadataSummary = Omit<BlockMetadata, "actions" | "triggers"> & {
  actions: number;
  triggers: number;
  suggestedActions?: ActionBase[];
  suggestedTriggers?: TriggerBase[];
}


const BlockPackageMetadata = z.object({
  projectUsage: z.number(),
  tags: z.array(z.string()).optional(),
  blockType: z.nativeEnum(BlockType),
  packageType: z.nativeEnum(PackageType),
  platformId: z.string().optional(),
  archiveId: z.string().optional(),
})
type BlockPackageMetadata = z.infer<typeof BlockPackageMetadata>

export const BlockMetadataModel = z.object({
  ...BlockMetadata.shape,
  ...BlockPackageMetadata.shape,
})
export type BlockMetadataModel = BlockMetadata & BlockPackageMetadata

export const BlockMetadataModelSummary = z.object({
  ...BlockMetadataSummary.shape,
  ...BlockPackageMetadata.shape,
})
export type BlockMetadataModelSummary = BlockMetadataSummary & BlockPackageMetadata;

export const BlockPackageInformation = z.object({
  name: z.string(),
  version: z.string(),
})
export type BlockPackageInformation = z.infer<typeof BlockPackageInformation>
