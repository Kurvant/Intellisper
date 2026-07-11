// Clean-room implementation — pure structural diff between two project states (capability
// spec J.1). No I/O: given a *current* state and a *new* (target) state it returns the set
// of operations that would make current converge to new. Applying those operations is the
// job of projectStateService.apply (which delegates the actual mutations to
// projectStateHelper).
//
// Entities are matched across states by their stable external identity (externalId, falling
// back to the row id), never by their per-project row id — so the same flow/table authored
// in one workspace is recognized in another and re-runs are idempotent (external-id is the
// universal correlation key). For each kind:
//   - present in new, absent in current            → CREATE (carries the new state as-is)
//   - present in current, absent in new            → DELETE (carries the current state)
//   - present in both and materially different     → UPDATE (else skipped)
// Operations are emitted in a stable order: DELETEs, then CREATEs, then UPDATEs.
//
// "Materially different" is a deep, property-order-independent comparison over the entity's
// meaningful content only. The per-project row id is excluded; block versions are compared
// at major.minor precision (a patch bump is not a change) — matching the reference's release
// semantics so trivial version drift does not churn a release.
import {
    ConnectionOperation,
    ConnectionOperationType,
    ConnectionState,
    DiffState,
    FlowProjectOperationType,
    FlowState,
    isNil,
    ProjectOperation,
    ProjectState,
    TableOperation,
    TableOperationType,
    TableState,
} from '@intelblocks/shared'
import deepEqual from 'deep-equal'

function externalIdOfFlow(flow: FlowState): string {
    return flow.externalId ?? flow.id
}

function indexBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T> {
    const map = new Map<string, T>()
    for (const item of items) {
        map.set(keyOf(item), item)
    }
    return map
}

// Reduce a block version to major.minor so a patch-level bump ("0.1.0" vs "0.1.1") is not a
// difference, while a major/minor bump ("0.1.0" vs "0.2.1") is. Any leading range operator
// (^ ~) is stripped; a non-semver string is returned unchanged.
function toMajorMinor(version: unknown): unknown {
    if (typeof version !== 'string') {
        return version
    }
    const cleaned = version.replace(/^[\^~]/, '')
    const parts = cleaned.split('.')
    if (parts.length < 2) {
        return version
    }
    return `${parts[0]}.${parts[1]}`
}

// Deep-clone `value` while normalizing every `blockVersion` to major.minor, so a deep-equal
// comparison ignores patch-level version drift throughout the (arbitrarily nested) trigger
// and action graph.
function normalizeBlockVersions(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeBlockVersions)
    }
    if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            result[key] = key === 'blockVersion' ? toMajorMinor(entry) : normalizeBlockVersions(entry)
        }
        return result
    }
    return value
}

// The comparable content of a flow: its external identity and its version *definition*
// (display name + trigger graph), with block versions normalized to major.minor. Row ids,
// timestamps, and the enabled/disabled *status* are excluded — status is not part of the
// definition and is (re)applied separately at apply time (an update preserves the target's
// own status), so a status-only difference must not register as a content change.
function flowContent(flow: FlowState): unknown {
    return normalizeBlockVersions({
        externalId: externalIdOfFlow(flow),
        displayName: flow.version.displayName,
        trigger: flow.version.trigger,
    })
}

function flowsEqual(a: FlowState, b: FlowState): boolean {
    return deepEqual(flowContent(a), flowContent(b), { strict: true })
}

// The comparable content of a table: its externalId, name, and fields. Row id and any
// server-managed status/trigger metadata are excluded, so an identical table carrying a
// different local id — or omitting optional metadata — is not seen as a change.
function tableContent(table: TableState): unknown {
    return { externalId: table.externalId, name: table.name, fields: table.fields }
}

function tablesEqual(a: TableState, b: TableState): boolean {
    return deepEqual(tableContent(a), tableContent(b), { strict: true })
}

export const projectDiffService = {
    // Compute the structural difference required to make `currentState` match `newState`.
    diff({ currentState, newState }: DiffParams): DiffState {
        return {
            flows: diffFlows(currentState.flows, newState.flows),
            connections: diffConnections(currentState.connections ?? [], newState.connections ?? []),
            tables: diffTables(currentState.tables ?? [], newState.tables ?? []),
        }
    },
}

function diffFlows(currentFlows: FlowState[], newFlows: FlowState[]): ProjectOperation[] {
    const deletes: ProjectOperation[] = []
    const creates: ProjectOperation[] = []
    const updates: ProjectOperation[] = []

    const currentByExternalId = indexBy(currentFlows, externalIdOfFlow)
    const newByExternalId = indexBy(newFlows, externalIdOfFlow)

    for (const current of currentFlows) {
        if (!newByExternalId.has(externalIdOfFlow(current))) {
            deletes.push({ type: FlowProjectOperationType.DELETE_FLOW, flowState: current })
        }
    }
    for (const next of newFlows) {
        const current = currentByExternalId.get(externalIdOfFlow(next))
        if (isNil(current)) {
            creates.push({ type: FlowProjectOperationType.CREATE_FLOW, flowState: next })
        }
        else if (!flowsEqual(current, next)) {
            updates.push({ type: FlowProjectOperationType.UPDATE_FLOW, flowState: current, newFlowState: next })
        }
    }
    return [...deletes, ...creates, ...updates]
}

function diffTables(currentTables: TableState[], newTables: TableState[]): TableOperation[] {
    const deletes: TableOperation[] = []
    const creates: TableOperation[] = []
    const updates: TableOperation[] = []

    const currentByExternalId = indexBy(currentTables, (t) => t.externalId)
    const newByExternalId = indexBy(newTables, (t) => t.externalId)

    for (const current of currentTables) {
        if (!newByExternalId.has(current.externalId)) {
            deletes.push({ type: TableOperationType.DELETE_TABLE, tableState: current })
        }
    }
    for (const next of newTables) {
        const current = currentByExternalId.get(next.externalId)
        if (isNil(current)) {
            creates.push({ type: TableOperationType.CREATE_TABLE, tableState: next })
        }
        else if (!tablesEqual(current, next)) {
            updates.push({ type: TableOperationType.UPDATE_TABLE, tableState: current, newTableState: next })
        }
    }
    return [...deletes, ...creates, ...updates]
}

function diffConnections(currentConnections: ConnectionState[], newConnections: ConnectionState[]): ConnectionOperation[] {
    const operations: ConnectionOperation[] = []
    const currentByExternalId = indexBy(currentConnections, (c) => c.externalId)
    for (const next of newConnections) {
        const current = currentByExternalId.get(next.externalId)
        if (isNil(current)) {
            operations.push({ type: ConnectionOperationType.CREATE_CONNECTION, connectionState: next })
        }
        else if (!deepEqual(current, next, { strict: true })) {
            operations.push({ type: ConnectionOperationType.UPDATE_CONNECTION, connectionState: current, newConnectionState: next })
        }
    }
    return operations
}

type DiffParams = {
    currentState: Pick<ProjectState, 'flows'> & Partial<ProjectState>
    newState: Pick<ProjectState, 'flows'> & Partial<ProjectState>
}
