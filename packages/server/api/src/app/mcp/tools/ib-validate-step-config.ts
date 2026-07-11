import {
    BranchExecutionType,
    McpToolDefinition,
    McpToolResult,
    ProjectScopedMcpServer,
    RouterActionSettingsWithValidation,
    RouterExecutionType,
    SourceCode,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { mcpUtils } from './mcp-utils'

export const ibValidateStepConfigTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_validate_step_config',
        description: 'Validate a step configuration before applying it. Returns field-level errors without modifying any flow. Use this to check your config is correct before calling ib_update_step or ib_update_trigger.',
        inputSchema: validateStepConfigInput.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: async (args) => {
            try {
                const params = validateStepConfigInput.parse(args)

                switch (params.stepType) {
                    case 'BLOCK_ACTION':
                    case 'BLOCK_TRIGGER': {
                        const componentType = params.stepType === 'BLOCK_ACTION' ? 'action' : 'trigger'
                        const componentName = componentType === 'action' ? params.actionName : params.triggerName
                        if (!params.blockName || !componentName) {
                            const missing = !params.blockName ? 'blockName' : (componentType === 'action' ? 'actionName' : 'triggerName')
                            return { content: [{ type: 'text', text: `❌ ${missing} is required for ${componentType} validation.` }] }
                        }
                        return await validateBlockComponent({ blockName: params.blockName, componentName, componentType, input: params.input ?? {}, auth: params.auth, projectId: mcp.projectId, log })
                    }
                    case 'CODE':
                        return validateWithSchema({ schema: codeValidator, data: { sourceCode: { code: params.sourceCode ?? '', packageJson: params.packageJson ?? '{}' }, input: {} }, label: 'CODE' })
                    case 'LOOP_ON_ITEMS':
                        return validateWithSchema({ schema: loopValidator, data: { items: params.loopItems ?? '' }, label: 'LOOP_ON_ITEMS' })
                    case 'ROUTER':
                        return validateRouter(params.settings)
                }
            }
            catch (err) {
                return mcpUtils.mcpToolError('Validation failed', err)
            }
        },
    }
}

const validateStepConfigInput = z.object({
    stepType: z.enum(['BLOCK_ACTION', 'BLOCK_TRIGGER', 'CODE', 'LOOP_ON_ITEMS', 'ROUTER'])
        .describe('The type of step to validate.'),
    blockName: z.string().optional()
        .describe('For BLOCK_ACTION/BLOCK_TRIGGER: block name (e.g. "slack" or "@intelblocks/block-slack").'),
    actionName: z.string().optional()
        .describe('For BLOCK_ACTION: action name (e.g. "send_channel_message").'),
    triggerName: z.string().optional()
        .describe('For BLOCK_TRIGGER: trigger name (e.g. "new_mention").'),
    input: z.record(z.string(), z.unknown()).optional()
        .describe('For BLOCK_ACTION/BLOCK_TRIGGER: the input config to validate (key-value pairs).'),
    auth: z.string().optional()
        .describe('For BLOCK steps requiring auth: any non-empty string indicates auth is provided.'),
    sourceCode: z.string().optional()
        .describe('For CODE: the JavaScript/TypeScript source code.'),
    packageJson: z.string().optional()
        .describe('For CODE: package.json content as JSON string.'),
    loopItems: z.string().optional()
        .describe('For LOOP_ON_ITEMS: expression for items to iterate over.'),
    settings: z.record(z.string(), z.unknown()).optional()
        .describe('For ROUTER: raw router settings including branches and executionType.'),
})

async function validateBlockComponent({ blockName, componentName, componentType, input, auth, projectId, log }: ValidateBlockParams): Promise<McpToolResult> {
    const lookup = await mcpUtils.lookupBlockComponent({ blockName, componentName, componentType, projectId, log })
    if (lookup.error) {
        return lookup.error
    }

    const { component, blockName: normalized } = lookup
    const inputWithAuth = auth ? { ...input, auth } : input
    const diagnosis = mcpUtils.diagnoseBlockProps({
        props: component.props,
        input: inputWithAuth,
        blockAuth: lookup.block.auth,
        requireAuth: component.requireAuth,
        componentType,
    })

    if (diagnosis.missing.length === 0) {
        const uiHint = diagnosis.uiRequired.length > 0
            ? `\nNote: these fields require configuration in the Intellisper UI: ${diagnosis.uiRequired.join(', ')}.`
            : ''
        return {
            content: [{ type: 'text', text: `✅ Valid configuration for ${componentType.toUpperCase()} "${normalized}/${componentName}".${uiHint}` }],
            structuredContent: { valid: true, errors: [] },
        }
    }

    return {
        content: [{ type: 'text', text: `⚠️ Invalid configuration:\n${diagnosis.parts.join('\n')}` }],
        structuredContent: { valid: false, errors: diagnosis.parts },
    }
}

function validateWithSchema({ schema, data, label }: { schema: z.ZodType, data: unknown, label: string }): McpToolResult {
    const result = schema.safeParse(data)
    if (result.success) {
        return {
            content: [{ type: 'text', text: `✅ Valid ${label} configuration.` }],
            structuredContent: { valid: true, errors: [] },
        }
    }
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    return {
        content: [{ type: 'text', text: `⚠️ Invalid ${label} configuration:\n${errors.join('\n')}` }],
        structuredContent: { valid: false, errors },
    }
}

const codeValidator = z.object({
    sourceCode: SourceCode.and(z.object({
        code: z.string().min(1),
        packageJson: z.string().min(1),
    })),
    input: z.record(z.string(), z.unknown()),
})

const loopValidator = z.object({
    items: z.string().min(1),
})

function routerEnumHint(): string {
    return `Valid executionType values: ${Object.values(RouterExecutionType).join(', ')}\nBranch types: ${Object.values(BranchExecutionType).join(', ')}`
}

function validateRouter(settings: Record<string, unknown> | undefined): McpToolResult {
    if (!settings || !settings.branches || !settings.executionType || (Array.isArray(settings.branches) && settings.branches.length === 0)) {
        const example = JSON.stringify({
            branches: [
                {
                    branchName: 'Branch 1',
                    branchType: BranchExecutionType.CONDITION,
                    conditions: [[{
                        firstValue: '{{trigger[\'output\'].status}}',
                        operator: 'TEXT_EXACTLY_MATCHES',
                        secondValue: 'active',
                    }]],
                },
                { branchName: 'Otherwise', branchType: BranchExecutionType.FALLBACK },
            ],
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        }, null, 2)
        return {
            content: [{
                type: 'text',
                text: `⚠️ Invalid ROUTER configuration: settings must include branches and executionType.\n\n${routerEnumHint()}\n\nExample:\n${example}`,
            }],
            structuredContent: { valid: false, errors: ['settings must include branches and executionType'] },
        }
    }
    const result = RouterActionSettingsWithValidation.safeParse(settings)
    if (result.success) {
        return {
            content: [{ type: 'text', text: '✅ Valid ROUTER configuration.' }],
            structuredContent: { valid: true, errors: [] },
        }
    }
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    return {
        content: [{
            type: 'text',
            text: `⚠️ Invalid ROUTER configuration:\n${errors.join('\n')}\n\n${routerEnumHint()}`,
        }],
        structuredContent: { valid: false, errors },
    }
}

type ValidateBlockParams = {
    blockName: string
    componentName: string
    componentType: 'action' | 'trigger'
    input: Record<string, unknown>
    auth: string | undefined
    projectId: string
    log: FastifyBaseLogger
}
