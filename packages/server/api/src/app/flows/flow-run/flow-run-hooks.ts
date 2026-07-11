import { IbEdition, FlowRun, FlowTriggerType, isFailedState, isFlowRunStateTerminal, isManualBlockTrigger, isNil, RunEnvironment, UpdateRunProgressRequest, WebsocketClientEvent } from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { alertsService } from '../../enterprise/alerts/alerts-service'
import { system } from '../../helper/system/system'
import { flowVersionService } from '../flow-version/flow-version.service'

const paidEditions = [IbEdition.CLOUD, IbEdition.ENTERPRISE].includes(system.getEdition())
export const flowRunHooks = (log: FastifyBaseLogger) => ({
    async onFinish(flowRun: FlowRun): Promise<void> {
        if (!isFlowRunStateTerminal({
            status: flowRun.status,
            ignoreInternalError: true,
        })) {
            return
        }
        const flowVersion = await flowVersionService(log).getOne(flowRun.flowVersionId)
        const isBlockTrigger = !isNil(flowVersion) && flowVersion.trigger.type === FlowTriggerType.BLOCK && !isNil(flowVersion.trigger.settings.triggerName) 
        const isManualTrigger = isBlockTrigger && isManualBlockTrigger({ blockName: flowVersion.trigger.settings.blockName, triggerName: flowVersion.trigger.settings.triggerName })
        if (flowRun.environment === RunEnvironment.TESTING || isManualTrigger) {
            websocketService.to(flowRun.projectId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, {
                flowRun,
            } satisfies UpdateRunProgressRequest)
        }
        if (isFailedState(flowRun.status) && flowRun.environment === RunEnvironment.PRODUCTION && !isNil(flowRun.failedStep)) {
            const date = dayjs(flowRun.created).toISOString()
            const issueToAlert = {
                projectId: flowRun.projectId,
                flowVersionId: flowRun.flowVersionId,
                flowId: flowRun.flowId,
                created: date,
            }

            if (paidEditions) {
                await alertsService(log).sendAlertOnRunFinish({
                    issueToAlert,
                    flowRunId: flowRun.id,
                    failedStep: flowRun.failedStep,
                })
            }
        }
        if (!paidEditions) {
            return
        }
    },
})
