import { McpToolDefinition, ProjectScopedMcpServer } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { ibAddBranchTool } from './ib-add-branch'
import { ibAddStepTool } from './ib-add-step'
import { ibBuildFlowTool } from './ib-build-flow'
import { ibChangeFlowStatusTool } from './ib-change-flow-status'
import { ibCreateFlowTool } from './ib-create-flow'
import { ibCreateTableTool } from './ib-create-table'
import { ibDeleteBranchTool } from './ib-delete-branch'
import { ibDeleteFlowTool } from './ib-delete-flow'
import { ibDeleteRecordsTool } from './ib-delete-records'
import { ibDeleteStepTool } from './ib-delete-step'
import { ibDeleteTableTool } from './ib-delete-table'
import { ibDuplicateFlowTool } from './ib-duplicate-flow'
import { ibFindRecordsTool } from './ib-find-records'
import { ibFlowStructureTool } from './ib-flow-structure'
import { ibGetBlockPropsTool } from './ib-get-block-props'
import { ibGetRunTool } from './ib-get-run'
import { ibInsertRecordsTool } from './ib-insert-records'
import { ibListAiModelsTool } from './ib-list-ai-models'
import { ibListConnectionsTool } from './ib-list-connections'
import { ibListFlowsTool } from './ib-list-flows'
import { ibListRunsTool } from './ib-list-runs'
import { ibListTablesTool } from './ib-list-tables'
import { ibLockAndPublishTool } from './ib-lock-and-publish'
import { ibManageFieldsTool } from './ib-manage-fields'
import { ibManageNotesTool } from './ib-manage-notes'
import { ibReadStepCodeTool } from './ib-read-step-code'
import { ibRenameFlowTool } from './ib-rename-flow'
import { ibResearchBlocksTool } from './ib-research-blocks'
import { ibResolvePropertyChainTool } from './ib-resolve-property-chain'
import { ibResolvePropertyOptionsTool } from './ib-resolve-property-options'
import { ibRetryRunTool } from './ib-retry-run'
import { ibRunActionTool } from './ib-run-action'
import { ibSetupGuideTool } from './ib-setup-guide'
import { ibTestFlowTool } from './ib-test-flow'
import { ibTestStepTool } from './ib-test-step'
import { ibUpdateBranchTool } from './ib-update-branch'
import { ibUpdateRecordTool } from './ib-update-record'
import { ibUpdateStepTool } from './ib-update-step'
import { ibUpdateTriggerTool } from './ib-update-trigger'
import { ibValidateFlowTool } from './ib-validate-flow'
import { ibValidateStepConfigTool } from './ib-validate-step-config'

export const LOCKED_TOOL_NAMES: string[] = [
    'ib_list_flows',
    'ib_flow_structure',
    'ib_read_step_code',
    'ib_validate_flow',
    'ib_research_blocks',
    'ib_get_block_props',
    'ib_resolve_property_options',
    'ib_resolve_property_chain',
    'ib_validate_step_config',
    'ib_list_connections',
    'ib_list_ai_models',
    'ib_list_tables',
    'ib_find_records',
    'ib_list_runs',
    'ib_get_run',
    'ib_setup_guide',
]

export const PLATFORM_LEVEL_TOOL_NAMES: string[] = [
    'ib_research_blocks',
    'ib_list_ai_models',
    'ib_get_block_props',
]

// NOTE: Keep this list in sync with TOOL_CATEGORIES in
// packages/web/src/app/components/project-settings/mcp-server/utils/mcp-tools-metadata.ts
// Any tool added here must also be added there so it appears in the UI settings panel.
export const ALL_CONTROLLABLE_TOOL_NAMES: string[] = [
    'ib_build_flow',
    'ib_create_flow',
    'ib_duplicate_flow',
    'ib_rename_flow',
    'ib_update_trigger',
    'ib_add_step',
    'ib_update_step',
    'ib_delete_step',
    'ib_add_branch',
    'ib_update_branch',
    'ib_delete_branch',
    'ib_lock_and_publish',
    'ib_change_flow_status',
    'ib_delete_flow',
    'ib_manage_notes',
    'ib_create_table',
    'ib_delete_table',
    'ib_manage_fields',
    'ib_insert_records',
    'ib_update_record',
    'ib_delete_records',
    'ib_test_flow',
    'ib_test_step',
    'ib_retry_run',
    'ib_run_action',
]

export const intellisperTools = (mcp: ProjectScopedMcpServer, userId: string | undefined, log: FastifyBaseLogger): McpToolDefinition[] => [
    ibBuildFlowTool({ mcp, userId }, log),
    ibCreateFlowTool({ mcp, userId }, log),
    ibDuplicateFlowTool({ mcp, userId }, log),
    ibRenameFlowTool(mcp, log),
    ibListFlowsTool(mcp, log),
    ibFlowStructureTool(mcp, log),
    ibReadStepCodeTool(mcp, log),
    ibValidateFlowTool(mcp, log),
    ibResearchBlocksTool(mcp, log),
    ibGetBlockPropsTool(mcp, log),
    ibResolvePropertyOptionsTool(mcp, log),
    ibResolvePropertyChainTool(mcp, log),
    ibValidateStepConfigTool(mcp, log),
    ibListConnectionsTool(mcp, log),
    ibUpdateTriggerTool(mcp, log),
    ibAddStepTool(mcp, log),
    ibUpdateStepTool(mcp, log),
    ibDeleteStepTool(mcp, log),
    ibAddBranchTool(mcp, log),
    ibUpdateBranchTool(mcp, log),
    ibDeleteBranchTool(mcp, log),
    ibLockAndPublishTool(mcp, log),
    ibChangeFlowStatusTool(mcp, log),
    ibDeleteFlowTool(mcp, log),
    ibManageNotesTool(mcp, log),
    ibListAiModelsTool(mcp, log),
    ibListTablesTool(mcp, log),
    ibFindRecordsTool(mcp, log),
    ibCreateTableTool(mcp, log),
    ibDeleteTableTool(mcp, log),
    ibManageFieldsTool(mcp, log),
    ibInsertRecordsTool(mcp, log),
    ibUpdateRecordTool(mcp, log),
    ibDeleteRecordsTool(mcp, log),
    ibListRunsTool(mcp, log),
    ibGetRunTool(mcp, log),
    ibTestFlowTool(mcp, log),
    ibTestStepTool(mcp, log),
    ibRetryRunTool(mcp, log),
    ibRunActionTool(mcp, log),
    ibSetupGuideTool(mcp, log),
]
