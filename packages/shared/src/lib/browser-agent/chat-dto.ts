import { z } from 'zod'

/** An interactable element in a page snapshot (from the extension). */
export const PageInteractable = z.object({
    ref: z.string(),
    role: z.string().optional(),
    label: z.string().optional(),
    tag: z.string().optional(),
    type: z.string().optional(),
    value: z.string().optional(),
    href: z.string().optional(),
})
export type PageInteractable = z.infer<typeof PageInteractable>

/** The distilled page snapshot the extension may attach to a turn. Treated as UNTRUSTED DATA. */
export const PageSnapshotDto = z.object({
    url: z.string().max(2000),
    title: z.string().max(1000),
    docType: z.enum(['html', 'pdf', 'youtube']).optional(),
    text: z.string().max(60000).optional(),
    textTruncated: z.boolean().optional(),
    interactables: z.array(PageInteractable).max(300).optional(),
})
export type PageSnapshotDto = z.infer<typeof PageSnapshotDto>

/**
 * A file attached to a turn. Treated as UNTRUSTED DATA, exactly like a page snapshot.
 *
 * Two roles, mirroring how the client stages an attachment:
 *  - `read`  — the client already extracted the content (pdf/docx/text → `text`, image → base64).
 *              Nothing is persisted server-side; the content rides along with this turn only.
 *  - `edit`  — the file was uploaded first (POST /browser-agent/files) and is referenced by
 *              `fileId`, so the agent's file tools can rewrite and return it.
 *
 * Caps are deliberate: `text` matches the page snapshot's budget (60k ≈ a long document) and the
 * array is bounded so a turn can never be inflated without limit.
 */
export const TurnFileDto = z.object({
    name: z.string().max(500),
    mime: z.string().max(255),
    role: z.enum(['read', 'edit']),
    /** Present for role='edit': the id returned by the file-upload route. */
    fileId: z.string().max(100).optional(),
    /** Present for role='read' on a text-extractable file (client-side extraction). */
    text: z.string().max(60000).optional(),
    /** Present for role='read' on an image (data URL / base64). */
    imageBase64: z.string().max(8_000_000).optional(),
})
export type TurnFileDto = z.infer<typeof TurnFileDto>

export const BrowserAgentChatRequest = z.object({
    /** Project the turn runs under (personal project by default). Extracted for project scoping. */
    projectId: z.string(),
    message: z.string().min(1).max(10000),
    conversationId: z.string().optional(),
    page: PageSnapshotDto.nullable().optional(),
    /** Files attached to this turn (untrusted data). Bounded — see TurnFileDto. */
    files: z.array(TurnFileDto).max(10).nullable().optional(),
})
export type BrowserAgentChatRequest = z.infer<typeof BrowserAgentChatRequest>

export const BrowserAgentObservationRequest = z.object({
    projectId: z.string(),
    actionId: z.string(),
    ok: z.boolean(),
    observation: z.record(z.string(), z.unknown()),
})
export type BrowserAgentObservationRequest = z.infer<typeof BrowserAgentObservationRequest>

export const BrowserAgentActionDecisionRequest = z.object({
    projectId: z.string(),
    actionId: z.string(),
})
export type BrowserAgentActionDecisionRequest = z.infer<typeof BrowserAgentActionDecisionRequest>

/** A run-scoped action with no per-action target (research expand / decline-expand). */
export const BrowserAgentRunActionRequest = z.object({
    projectId: z.string(),
})
export type BrowserAgentRunActionRequest = z.infer<typeof BrowserAgentRunActionRequest>
