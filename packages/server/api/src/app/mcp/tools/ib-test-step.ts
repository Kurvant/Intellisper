import { McpToolDefinition, Permission, ProjectScopedMcpServer } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { executeFlowTest } from './flow-run-utils'
import { mcpUtils } from './mcp-utils'

const testStepInput = z.object({
    flowId: z.string().describe('The ID of the flow containing the step. Use ib_list_flows to find it.'),
    stepName: z.string().describe('The name of the step to test (e.g., "step_1"). Use ib_flow_structure to find it.'),
    displayName: z.string().optional().describe('Short approval prompt shown to the user (e.g. "Test Send Email step in Welcome Flow"). Must include what the action does and the target name.'),
    triggerTestData: z.record(z.string(), z.unknown()).optional().describe('Mock trigger output data. Saved as sample data before running the test. Useful when the trigger has no prior test data.'),
})

export const ibTestStepTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_test_step',
        permission: Permission.WRITE_FLOW,
        description: 'Test a single step within a flow. Runs all steps up to and including the specified step. The flow must have a configured trigger. Pass triggerTestData when no sample data exists.',
        inputSchema: testStepInput.shape,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
        execute: async (args) => {
            try {
                const { flowId, stepName, triggerTestData } = testStepInput.parse(args)
                return await executeFlowTest({ flowId, projectId: mcp.projectId, stepName, triggerTestData, log })
            }
            catch (err) {
                log.error({ err, projectId: mcp.projectId }, 'ib_test_step failed')
                return mcpUtils.mcpToolError('Failed to test step', err)
            }
        },
    }
}
