export type ToolMeta = { name: string; description: string };
export type ToolCategory = {
  label: string;
  tools: ToolMeta[];
  locked?: boolean;
};

// NOTE: Keep this list in sync with ALL_CONTROLLABLE_TOOL_NAMES and LOCKED_TOOL_NAMES in
// packages/server/api/src/app/mcp/tools/index.ts
// Any tool added to the backend index must also be added here so it appears in the UI settings panel.
export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    label: 'Discovery',
    locked: true,
    tools: [
      {
        name: 'ib_list_flows',
        description: 'List all flows in the current project',
      },
      {
        name: 'ib_flow_structure',
        description:
          'Get the structure of a flow: step tree, configuration status, and valid insert locations',
      },
      {
        name: 'ib_read_step_code',
        description:
          'Read full source code, package.json, and input of a CODE step',
      },
      {
        name: 'ib_validate_flow',
        description:
          'Validate a flow for structural issues without publishing — checks step validity, template references, and empty branches',
      },
      {
        name: 'ib_research_blocks',
        description:
          'Research blocks with actions and triggers — required before adding or updating steps',
      },
      {
        name: 'ib_get_block_props',
        description:
          'Get detailed property schema for a specific block action or trigger',
      },
      {
        name: 'ib_resolve_property_options',
        description:
          'Resolve dropdown options for a specific block property — returns available choices with labels and IDs',
      },
      {
        name: 'ib_resolve_property_chain',
        description:
          'Resolve a chain of dependent dropdown properties in one call — for cascading fields like Spreadsheet → Sheet → Columns',
      },
      {
        name: 'ib_validate_step_config',
        description:
          'Validate step configuration before applying — returns field-level errors without modifying any flow',
      },
      {
        name: 'ib_list_connections',
        description:
          'List OAuth/app connections in the project — required before adding steps that need auth',
      },
      {
        name: 'ib_list_ai_models',
        description: 'List configured AI providers and their available models',
      },
      {
        name: 'ib_list_tables',
        description: 'List all tables and their fields in the current project',
      },
      {
        name: 'ib_find_records',
        description: 'Query records from a table with optional filtering',
      },
      {
        name: 'ib_list_runs',
        description: 'List recent flow runs with optional filters',
      },
      {
        name: 'ib_get_run',
        description:
          'Get detailed results of a flow run including step outputs and errors',
      },
      {
        name: 'ib_setup_guide',
        description:
          'Get instructions for setting up connections or AI providers',
      },
    ],
  },
  {
    label: 'Flow Management',
    tools: [
      {
        name: 'ib_create_flow',
        description: 'Create a new flow',
      },
      {
        name: 'ib_duplicate_flow',
        description:
          'Duplicate an existing flow with all steps and configuration',
      },
      {
        name: 'ib_rename_flow',
        description: 'Rename an existing flow',
      },
      {
        name: 'ib_change_flow_status',
        description: 'Enable or disable a flow',
      },
      {
        name: 'ib_delete_flow',
        description: 'Permanently delete a flow and all its versions',
      },
      {
        name: 'ib_lock_and_publish',
        description: 'Publish the current draft of a flow',
      },
    ],
  },
  {
    label: 'Flow Building',
    tools: [
      {
        name: 'ib_build_flow',
        description: 'Create a complete flow in one call: trigger + steps',
      },
      {
        name: 'ib_update_trigger',
        description: 'Set or update the trigger for a flow',
      },
      {
        name: 'ib_add_step',
        description: 'Add a new step to a flow',
      },
      {
        name: 'ib_update_step',
        description: "Update an existing step's settings",
      },
      {
        name: 'ib_delete_step',
        description: 'Delete a step from a flow',
      },
    ],
  },
  {
    label: 'Router & Branching',
    tools: [
      {
        name: 'ib_add_branch',
        description: 'Add a conditional branch to a router step',
      },
      {
        name: 'ib_update_branch',
        description:
          'Update the conditions or name of an existing router branch',
      },
      {
        name: 'ib_delete_branch',
        description: 'Delete a branch from a router step',
      },
    ],
  },
  {
    label: 'Annotations',
    tools: [
      {
        name: 'ib_manage_notes',
        description: 'Add, update, or delete canvas notes on a flow',
      },
    ],
  },
  {
    label: 'Tables',
    tools: [
      {
        name: 'ib_create_table',
        description: 'Create a new table with initial fields',
      },
      {
        name: 'ib_delete_table',
        description: 'Permanently delete a table and all its data',
      },
      {
        name: 'ib_manage_fields',
        description: 'Add, rename, or delete fields on a table',
      },
      {
        name: 'ib_insert_records',
        description: 'Insert one or more records into a table',
      },
      {
        name: 'ib_update_record',
        description: 'Update specific cells in a record',
      },
      {
        name: 'ib_delete_records',
        description: 'Delete records by their IDs',
      },
    ],
  },
  {
    label: 'Testing & Runs',
    tools: [
      {
        name: 'ib_test_flow',
        description: 'Test a flow end-to-end and get step-by-step results',
      },
      {
        name: 'ib_test_step',
        description: 'Test a single step within a flow',
      },
      {
        name: 'ib_retry_run',
        description: 'Retry a failed flow run',
      },
      {
        name: 'ib_run_action',
        description:
          'Run a single block action once without saving a flow — for one-shot tasks like "check my inbox"',
      },
    ],
  },
];

export const ALL_CONTROLLABLE_TOOL_NAMES: string[] = TOOL_CATEGORIES.filter(
  (c) => !c.locked,
).flatMap((c) => c.tools.map((t) => t.name));
