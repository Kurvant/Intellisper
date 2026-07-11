// Clean-room mapping — DiffState (full operation payloads) → ProjectSyncPlan (the light,
// UI-facing plan of what would change: entity ids + display names, plus per-flow errors).
import {
    DiffState,
    FlowProjectOperation,
    FlowProjectOperationType,
    ProjectSyncPlan,
} from '@intelblocks/shared'

export function toSyncPlan(diffState: DiffState): ProjectSyncPlan {
    const flows: FlowProjectOperation[] = diffState.flows.map((operation) => {
        switch (operation.type) {
            case FlowProjectOperationType.CREATE_FLOW:
                return {
                    type: FlowProjectOperationType.CREATE_FLOW,
                    flow: { id: operation.flowState.id, displayName: operation.flowState.version.displayName },
                }
            case FlowProjectOperationType.UPDATE_FLOW:
                return {
                    type: FlowProjectOperationType.UPDATE_FLOW,
                    flow: { id: operation.newFlowState.id, displayName: operation.newFlowState.version.displayName },
                    targetFlow: { id: operation.flowState.id, displayName: operation.flowState.version.displayName },
                }
            case FlowProjectOperationType.DELETE_FLOW:
                return {
                    type: FlowProjectOperationType.DELETE_FLOW,
                    flow: { id: operation.flowState.id, displayName: operation.flowState.version.displayName },
                }
        }
    })

    return {
        flows,
        connections: diffState.connections,
        tables: diffState.tables,
        errors: [],
    }
}
