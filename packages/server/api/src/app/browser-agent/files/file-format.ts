import mammoth from 'mammoth'

/**
 * File-format helpers for the agent's file tools. Read supports docx (via mammoth) + text/markdown;
 * EDIT produces plain text (utf8) — the `docx` generator package isn't a dependency, so editing a
 * .docx yields a text result, and other binary types are read-only. This matches the product rule:
 * "you can edit plain text; for other types you can read, summarise, and extract."
 */
const TEXT_MIMES = new Set(['text/plain', 'text/markdown'])
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const fileFormat = {
    /** Whether a mime can be EDITED (produces a downloadable edited file). */
    isEditable(mime: string): boolean {
        return TEXT_MIMES.has(mime) || mime === DOCX_MIME
    },

    /** Extract readable text from supported file bytes. */
    async extractText(mime: string, bytes: Buffer): Promise<string> {
        if (mime === DOCX_MIME) {
            const { value } = await mammoth.extractRawText({ buffer: bytes })
            return value
        }
        return bytes.toString('utf8')
    },

    /**
     * Build the edited file bytes + its output mime/name. docx edits are emitted as `.txt` (no docx
     * generator available); text/markdown keep their type.
     */
    buildEdited(originalMime: string, originalName: string, newContent: string): { bytes: Buffer, mime: string, name: string } {
        if (originalMime === DOCX_MIME) {
            const name = originalName.replace(/\.docx$/i, '') + ' (edited).txt'
            return { bytes: Buffer.from(newContent, 'utf8'), mime: 'text/plain', name }
        }
        const name = appendEdited(originalName)
        return { bytes: Buffer.from(newContent, 'utf8'), mime: originalMime, name }
    },
}

function appendEdited(name: string): string {
    const dot = name.lastIndexOf('.')
    if (dot <= 0) return `${name} (edited)`
    return `${name.slice(0, dot)} (edited)${name.slice(dot)}`
}
