import { flowStructureUtil, FlowVersion } from '@intelblocks/shared'
import { flowMigrationUtil } from './flow-migration-util'
import { Migration } from '.'

export const migrateAgentBlockV4: Migration = {
    targetSchemaVersion: '4',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowMigrationUtil.pinBlockToVersion(flowVersion, '@intelblocks/block-agent', '0.2.4')
        const agentIds = flowStructureUtil.extractAgentIds(newVersion)
        return {
            ...newVersion,
            schemaVersion: '5',
            agentIds,
        }
    },
}

