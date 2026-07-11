import { FlowVersion } from '@intelblocks/shared'
import { flowMigrationUtil } from './flow-migration-util'
import { Migration } from '.'

export const migrateAgentBlockV2: Migration = {
    targetSchemaVersion: '2',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowMigrationUtil.pinBlockToVersion(flowVersion, '@intelblocks/block-agent', '0.2.0')
        return {
            ...newVersion,
            schemaVersion: '3',
        }
    },
} 