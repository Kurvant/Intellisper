// Clean-room constant — HTTP header carrying the chat conversation id for the
// MCP OAuth flow. The header NAME is our own protocol vocabulary (lower-case
// per HTTP header conventions). Used by mcp-oauth.controller to correlate a
// request with a chat conversation. Part of the chat/agent layer (spec H.2).
export const CONVERSATION_ID_HEADER = 'x-conversation-id'
