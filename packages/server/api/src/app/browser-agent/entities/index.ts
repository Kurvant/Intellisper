import { EntitySchema } from 'typeorm'
import {
    AgentBatchJobEntity,
    AgentScheduleEntity,
} from './browser-agent-automation.entity'
import {
    AgentActionEntity,
    AgentConversationEntity,
    AgentMessageEntity,
    AgentRunEntity,
} from './browser-agent-core.entity'
import {
    AgentAuditLogEntity,
    AgentFileEntity,
    AgentUsageCounterEntity,
} from './browser-agent-file-audit-usage.entity'
import {
    MemoryEntityEntity,
    MemoryFactEntity,
    MemoryRelationEntity,
} from './browser-agent-memory.entity'
import {
    RoutineEntity,
    RoutineRunEntity,
    RoutineStepEntity,
} from './browser-agent-routine.entity'

export {
    AgentConversationEntity,
    AgentMessageEntity,
    AgentRunEntity,
    AgentActionEntity,
} from './browser-agent-core.entity'
export {
    MemoryFactEntity,
    MemoryEntityEntity,
    MemoryRelationEntity,
} from './browser-agent-memory.entity'
export {
    RoutineEntity,
    RoutineStepEntity,
    RoutineRunEntity,
} from './browser-agent-routine.entity'
export {
    AgentBatchJobEntity,
    AgentScheduleEntity,
} from './browser-agent-automation.entity'
export {
    AgentFileEntity,
    AgentAuditLogEntity,
    AgentUsageCounterEntity,
} from './browser-agent-file-audit-usage.entity'

/** The full ordered list of browser-agent entities, for registration in getEntities(). */
export const browserAgentEntities: EntitySchema<unknown>[] = [
    AgentConversationEntity,
    AgentMessageEntity,
    AgentRunEntity,
    AgentActionEntity,
    MemoryFactEntity,
    MemoryEntityEntity,
    MemoryRelationEntity,
    RoutineEntity,
    RoutineStepEntity,
    RoutineRunEntity,
    AgentBatchJobEntity,
    AgentScheduleEntity,
    AgentFileEntity,
    AgentAuditLogEntity,
    AgentUsageCounterEntity,
] as EntitySchema<unknown>[]
