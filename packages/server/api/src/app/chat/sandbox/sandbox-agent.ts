// Clean-room implementation — sandbox agent session-update protocol (capability spec H.2.a/H.2.d).
//
// The execution plane (worker) streams the model loop and emits typed "session update"
// events. SandboxSessionUpdateType is the closed vocabulary of those events — the wire
// values are the protocol contract shared between the streaming producer (the sandbox
// agent) and the consumer (stream-adapter, which translates them into the client's
// UI-message-stream protocol). The string values ARE the wire format and must not change
// without a coordinated protocol bump.
export enum SandboxSessionUpdateType {
    // Incremental assistant answer text.
    AGENT_MESSAGE_CHUNK = 'agent_message_chunk',
    // Incremental assistant reasoning/thinking text.
    AGENT_THOUGHT_CHUNK = 'agent_thought_chunk',
    // A tool invocation started (name + input available).
    TOOL_CALL = 'tool_call',
    // A previously started tool invocation progressed or finished (status + optional output).
    TOOL_CALL_UPDATE = 'tool_call_update',
    // The agent's current step-by-step plan.
    PLAN = 'plan',
    // Session metadata changed (e.g. an auto-generated title).
    SESSION_INFO_UPDATE = 'session_info_update',
    // Token usage accounting for the turn.
    USAGE_UPDATE = 'usage_update',
}
