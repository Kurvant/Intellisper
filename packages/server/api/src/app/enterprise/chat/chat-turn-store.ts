// Clean-room implementation — live-turn coordination store (capability spec H.2.c / H.2.e).
//
// The streaming turn runs in the worker (execution plane) but every stateful coordination
// decision lives here in the control plane, held in the distributed store so it survives across
// the many short RPC round-trips of a single turn and is visible to the HTTP endpoints the
// client hits (approve a gate, cancel a turn). Four concerns, all keyed by conversation/run:
//
//   - Approval gates (H.2.e): the agent opens a gate (a write action, a connection/question card)
//     and BLOCKS until the user approves or rejects. The worker registers the gate here
//     (`__store_pending_gate`) then long-polls (`__approval_wait`); the client's approve/reject
//     HTTP call records the decision here; the next poll returns it. Put-if-absent on the decision
//     means a late/duplicate decision cannot overwrite the first, and an unknown gate stays
//     `pending` (fail-closed — the worker keeps waiting rather than proceeding unapproved).
//   - Cancellation: the client asks to stop a turn; the worker polls `__cancel_check` every few
//     seconds and aborts when it sees the flag.
//   - Selected connections: when the user picks a connection in a card, the worker records it here
//     (`__store_selected_connection`) so the cross-project action executor can resolve which
//     connection to use for the rest of the turn.
//
// Everything is short-TTL'd: a turn is bounded (worker enforces a hard timeout), so stale
// coordination state must not linger.
import { distributedStore } from '../../database/redis-connections'

// A turn cannot outlive this; all coordination keys expire well after the worker's own hard
// turn/approval timeouts so a decision is never lost mid-turn, but nothing leaks indefinitely.
const TURN_TTL_SECONDS = 30 * 60

export type GateStatus = 'pending' | 'approved' | 'rejected'

export type PendingGate = {
    gateId: string
    toolName: string
    displayName: string
    toolInput: Record<string, unknown>
    status: GateStatus
    payload?: Record<string, unknown>
}

// The shape the worker's waitForApproval expects back from `__approval_wait`: either the literal
// string 'pending', or a resolved decision object.
export type GateDecision = 'pending' | { approved: boolean, payload?: Record<string, unknown> }

export type SelectedConnection = {
    blockName: string
    connectionExternalId: string
    label: string
    projectId: string
}

function gateKey(gateId: string): string {
    return `chat:gate:${gateId}`
}

function cancelKey(conversationId: string): string {
    return `chat:cancel:${conversationId}`
}

function connectionsKey(conversationId: string): string {
    return `chat:conn:${conversationId}`
}

export const chatTurnStore = {
    // Register a gate the agent just opened, in the `pending` state (worker → api).
    async storePendingGate(gate: Omit<PendingGate, 'status' | 'payload'>): Promise<void> {
        const record: PendingGate = { ...gate, status: 'pending' }
        await distributedStore.put(gateKey(gate.gateId), record, TURN_TTL_SECONDS)
    },

    // The worker's poll: return the current decision for a gate, or 'pending' if unresolved/unknown.
    async pollGate(gateId: string): Promise<GateDecision> {
        const gate = await distributedStore.get<PendingGate>(gateKey(gateId))
        if (!gate || gate.status === 'pending') {
            return 'pending'
        }
        return { approved: gate.status === 'approved', payload: gate.payload }
    },

    // Read a gate's full record (for the client-facing approve/reject endpoint to validate it).
    async getGate(gateId: string): Promise<PendingGate | null> {
        return distributedStore.get<PendingGate>(gateKey(gateId))
    },

    // Record the user's decision. First-decision-wins: a gate already resolved is not overwritten,
    // so a duplicate or racing approve/reject is a no-op. Returns true when this call set the
    // decision, false when it was already decided or the gate is unknown.
    async decideGate({ gateId, approved, payload }: { gateId: string, approved: boolean, payload?: Record<string, unknown> }): Promise<boolean> {
        const gate = await distributedStore.get<PendingGate>(gateKey(gateId))
        if (!gate || gate.status !== 'pending') {
            return false
        }
        const resolved: PendingGate = {
            ...gate,
            status: approved ? 'approved' : 'rejected',
            ...(payload !== undefined ? { payload } : {}),
        }
        await distributedStore.put(gateKey(gateId), resolved, TURN_TTL_SECONDS)
        return true
    },

    // Request cancellation of a conversation's active turn (client → api).
    async requestCancel(conversationId: string): Promise<void> {
        await distributedStore.put(cancelKey(conversationId), true, TURN_TTL_SECONDS)
    },

    // Worker poll: has cancellation been requested for this conversation?
    async isCancelRequested(conversationId: string): Promise<boolean> {
        const flag = await distributedStore.get<boolean>(cancelKey(conversationId))
        return flag === true
    },

    // Clear cancellation state at the end of a turn.
    async clearCancel(conversationId: string): Promise<void> {
        await distributedStore.delete(cancelKey(conversationId))
    },

    // Record a connection the user selected during the turn (worker → api). Accumulated per
    // conversation, keyed by block name (last selection wins for a given block).
    async storeSelectedConnection({ conversationId, connection }: { conversationId: string, connection: SelectedConnection }): Promise<void> {
        const existing = (await distributedStore.get<Record<string, SelectedConnection>>(connectionsKey(conversationId))) ?? {}
        existing[connection.blockName] = connection
        await distributedStore.put(connectionsKey(conversationId), existing, TURN_TTL_SECONDS)
    },

    // Resolve the connection the user selected for a block during this conversation, if any.
    async getSelectedConnection({ conversationId, blockName }: { conversationId: string, blockName: string }): Promise<SelectedConnection | null> {
        const map = await distributedStore.get<Record<string, SelectedConnection>>(connectionsKey(conversationId))
        return map?.[blockName] ?? null
    },
}
