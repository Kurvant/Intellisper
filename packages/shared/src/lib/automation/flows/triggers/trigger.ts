import { z } from 'zod'
import { STEP_NAME_REGEX } from '../../../core/common'
import { VersionType } from '../../pieces'
import { BlockActionSettings, CodeActionSettings, LoopOnItemsActionSettings, RouterActionSettings } from '../actions/action'
import { PropertySettings } from '../properties'
import { SampleDataSetting } from '../sample-data'

export const AUTHENTICATION_PROPERTY_NAME = 'auth'


const blockTriggerSettingsFields = {
    sampleData: SampleDataSetting.optional(),
    propertySettings: z.record(z.string(), PropertySettings),
    customLogoUrl: z.string().optional(),
    blockName: z.string(),
    blockVersion: VersionType,
    triggerName: z.string().optional(),
    input: z.record(z.string(), z.any()),
}

export const BlockTriggerSettings = z.object({
    ...blockTriggerSettingsFields,
})

export type BlockTriggerSettings = z.infer<typeof BlockTriggerSettings>


export enum FlowTriggerType {
    EMPTY = 'EMPTY',
    BLOCK = 'BLOCK_TRIGGER',
}

const commonProps = {
    name: z.string().regex(STEP_NAME_REGEX),
    valid: z.boolean(),
    displayName: z.string(),
    nextAction: z.any().optional(),
    lastUpdatedDate: z.string(),
}


export const EmptyTrigger = z.object({
    ...commonProps,
    type: z.literal(FlowTriggerType.EMPTY),
    settings: z.any(),
})

export type EmptyTrigger = z.infer<typeof EmptyTrigger>


export const BlockTrigger = z.object({
    ...commonProps,
    type: z.literal(FlowTriggerType.BLOCK),
    settings: BlockTriggerSettings,
})

export type BlockTrigger = z.infer<typeof BlockTrigger>

export const FlowTrigger = z.union([
    BlockTrigger,
    EmptyTrigger,
])

export type FlowTrigger = z.infer<typeof FlowTrigger>


export type StepSettings =
  | CodeActionSettings
  | BlockActionSettings
  | BlockTriggerSettings
  | RouterActionSettings
  | LoopOnItemsActionSettings
