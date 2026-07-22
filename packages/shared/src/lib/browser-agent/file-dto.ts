import { z } from 'zod'

export const BrowserAgentFileUploadResponse = z.object({
    fileId: z.string(),
    name: z.string(),
    mime: z.string(),
    editable: z.boolean(),
})
export type BrowserAgentFileUploadResponse = z.infer<typeof BrowserAgentFileUploadResponse>

export const BrowserAgentFileDownloadResponse = z.object({
    url: z.string(),
    name: z.string(),
})
export type BrowserAgentFileDownloadResponse = z.infer<typeof BrowserAgentFileDownloadResponse>
