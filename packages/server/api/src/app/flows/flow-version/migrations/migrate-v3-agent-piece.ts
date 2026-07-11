import { FlowVersion } from '@intelblocks/shared'
import { flowMigrationUtil } from './flow-migration-util'
import { Migration } from '.'

export const migrateAgentBlockV3: Migration = {
    targetSchemaVersion: '3',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowMigrationUtil.pinBlockToVersion(flowVersion, '@intelblocks/block-agent', '0.2.2')
        return {
            ...newVersion,
            schemaVersion: '4',
        }
    },
} 