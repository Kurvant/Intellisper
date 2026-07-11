import { FlowActionType, flowStructureUtil, FlowVersion, PropertyExecutionType } from '@intelblocks/shared'
import semver from 'semver'
import { Migration } from '.'

const HTTP_PIECE_NAME = '@intelblocks/block-http'
const WEBHOOK_PIECE_NAME = '@intelblocks/block-webhook'
const HTTP_RETURN_RESPONSE_ACTION = 'return_response'
const WEBHOOK_RETURN_RESPONSE_ACTION = 'return_response'

export const migrateHttpToWebhookV5: Migration = {
    targetSchemaVersion: '5',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (
                step.type === FlowActionType.BLOCK &&
                step.settings.blockName === HTTP_PIECE_NAME &&
                step.settings.actionName === HTTP_RETURN_RESPONSE_ACTION
            ) {
                const httpInput = step.settings.input || {}
                const fields: Record<string, unknown> = {}
                const blockVersionWithoutTildaOrPlus = step.settings.blockVersion.replace('~', '').replace('^', '')
                // Check the scehma for each action in the http block
                const isGreaterThanOrEqual050 = semver.gte(blockVersionWithoutTildaOrPlus, '0.5.0')

                if (httpInput['body'] && typeof httpInput['body'] === 'object' && 'data' in httpInput['body'] && isGreaterThanOrEqual050) {
                    fields['body'] = (httpInput['body'] as Record<string, unknown>)['data']
                }

                if (httpInput['body'] && typeof httpInput['body'] === 'object' && !isGreaterThanOrEqual050) {
                    fields['body'] = (httpInput['body'] as Record<string, unknown>)
                }
           


                if (httpInput['status'] !== undefined) {
                    fields['status'] = httpInput['status']
                }
                if (httpInput['headers']) {
                    fields['headers'] = httpInput['headers']
                }
                
                const webhookInput = {
                    respond: 'stop',
                    responseType: httpInput['body_type'] || 'json',
                    fields,
                }
                
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        blockName: WEBHOOK_PIECE_NAME,
                        blockVersion: '0.1.20',
                        actionName: WEBHOOK_RETURN_RESPONSE_ACTION,
                        input: webhookInput,
                        propertySettings: {
                            ...step.settings.propertySettings,
                            'respond': {
                                type: PropertyExecutionType.MANUAL,
                                schema: undefined,
                            },
                            'responseType': {
                                type: PropertyExecutionType.MANUAL,
                                schema: undefined,
                            },
                            'fields': {
                                type: PropertyExecutionType.MANUAL,
                                schema: undefined,
                            },
                        },
                    },
                }
            }
            return step
        })
        
        return {
            ...newVersion,
            schemaVersion: '6',
        }
    },
}