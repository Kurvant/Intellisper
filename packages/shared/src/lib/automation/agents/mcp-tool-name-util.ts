const MAX_PREFIX_LENGTH = 53

function shortHash(str: string): string {
    let h = 5381
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
    }
    return h.toString(36).padStart(6, '0').slice(-6)
}

/**
 * Normalizes a string for use as an agent tool name.
 * Format: {prefix_up_to_53_chars}_{6char_hash}_mcp (≤ 64 chars total)
 */
function createToolName(name: string): string {
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
    const prefix = sanitized.slice(0, MAX_PREFIX_LENGTH)
    const hash = shortHash(sanitized)
    return `${prefix}_${hash}_mcp`
}

/**
 * Strips the @scope/block- prefix from blockName (e.g. @intelblocks/block-slack → slack)
 * and delegates to createToolName.
 */
function createBlockToolName(blockName: string, actionName: string): string {
    const BLOCK_NAME_PREFIX = 'block-'
    const idx = blockName.indexOf(BLOCK_NAME_PREFIX)
    const shortBlockName = idx >= 0 ? blockName.substring(idx + BLOCK_NAME_PREFIX.length) : blockName
    return createToolName(`${shortBlockName}-${actionName}`)
}

export const mcpToolNameUtils = {
    createToolName,
    createBlockToolName,
}
