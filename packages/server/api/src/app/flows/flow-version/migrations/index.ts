import { FlowVersion, FlowVersionState, FlowVersionTemplate, ProjectId } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { migrateBranchToRouter } from './migrate-v0-branch-to-router'
import { migrateConnectionIds } from './migrate-v1-connection-ids'
import { migrateV10AiBlocksProviderId } from './migrate-v10-ai-pieces-provider-id'
import { migrateV11TablesToV2 } from './migrate-v11-tables-to-v2'
import { migrateV12FixBlockVersion } from './migrate-v12-fix-piece-version'
import { migrateV13AddNotes } from './migrate-v13-add-notes'
import { migrateV14AgentProviderModel } from './migrate-v14-agent-provider-model'
import { migrateV15AgentProviderModel } from './migrate-v15-agent-provider-model'
import { migrateV16AgentBlockToolNames } from './migrate-v16-agent-piece-tool-names'
import { migrateV17AddLastUpdatedDate } from './migrate-v17-add-last-updated-date'
import { migrateV18TablesFieldIds } from './migrate-v18-tables-find-records-field-ids'
import { migrateV19StripBlockVersionWildcards } from './migrate-v19-strip-piece-version-wildcards'
import { migrateAgentBlockV2 } from './migrate-v2-agent-piece'
import { migrateV20GoogleModelPrefix } from './migrate-v20-google-model-prefix'
import { migrateV21StepOutputNesting } from './migrate-v21-step-output-nesting'
import { migrateAgentBlockV3 } from './migrate-v3-agent-piece'
import { migrateAgentBlockV4 } from './migrate-v4-agent-piece'
import { migrateHttpToWebhookV5 } from './migrate-v5-http-to-webhook'
import { migratePropertySettingsV6 } from './migrate-v6-property-settings'
import { moveAgentsToFlowVerion } from './migrate-v7-agents-to-flow-version'
import { cleanUpAgentTools } from './migrate-v8-agent-tools'
import { migrateV9AiBlocks } from './migrate-v9-ai-pieces'

export type MigrationContext = {
    log: FastifyBaseLogger
    projectId?: ProjectId
}

export type Migration = {
    targetSchemaVersion: string | undefined
    migrate: (flowVersion: FlowVersion, context?: MigrationContext) => Promise<FlowVersion>
}

const migrations: Migration[] = [
    migrateBranchToRouter,
    migrateConnectionIds,
    migrateAgentBlockV2,
    migrateAgentBlockV3,
    migrateAgentBlockV4,
    migrateHttpToWebhookV5,
    migratePropertySettingsV6,
    moveAgentsToFlowVerion,
    cleanUpAgentTools,
    migrateV9AiBlocks,
    migrateV10AiBlocksProviderId,
    migrateV11TablesToV2,
    migrateV12FixBlockVersion,
    migrateV13AddNotes,
    migrateV14AgentProviderModel,
    migrateV15AgentProviderModel,
    migrateV16AgentBlockToolNames,
    migrateV17AddLastUpdatedDate,
    migrateV18TablesFieldIds,
    migrateV19StripBlockVersionWildcards,
    migrateV20GoogleModelPrefix,
    migrateV21StepOutputNesting,
] as const

export const flowMigrations = {
    apply: async (flowVersion: FlowVersion, context?: MigrationContext): Promise<FlowVersion> => {
        for (const migration of migrations) {
            if (flowVersion.schemaVersion === migration.targetSchemaVersion) {
                flowVersion = await migration.migrate(flowVersion, context)
            }
        }
        return flowVersion
    },
}

export const migrateFlowVersionTemplate = async ({ trigger, schemaVersion, notes, valid, displayName }: Pick<FlowVersionTemplate, 'trigger' | 'schemaVersion' | 'notes' | 'valid' | 'displayName'>): Promise<FlowVersionTemplate> => {
    return flowMigrations.apply({
        agentIds: [],
        connectionIds: [],
        created: new Date().toISOString(),
        displayName,
        flowId: '',
        id: '',
        updated: new Date().toISOString(),
        updatedBy: '',
        valid,
        trigger,
        state: FlowVersionState.DRAFT,
        schemaVersion,
        notes: notes ?? [],
    })
}

export const migrateFlowVersionTemplateList = async (flowVersions: FlowVersionTemplate[]): Promise<FlowVersionTemplate[]> => {
    return Promise.all(flowVersions.map(async (flowVersion) => {
        return migrateFlowVersionTemplate(flowVersion)
    }))
}

