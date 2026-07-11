import { SuggestionType } from '@intelblocks/shared'
import { describe, expect, it } from 'vitest'
import { blockSearching } from '../../../../src/app/pieces/metadata/utils/piece-searching'
import { BlockMetadataSchema } from '../../../../src/app/pieces/metadata/piece-metadata-entity'

// A block whose own actions/triggers are named nothing like the block itself.
// Searching for "Gmail" must still return its actions: the nested suggestion search
// matches on the parent block's display name, which is attached as `blockDisplayName`.
const gmail = {
    name: '@intelblocks/block-gmail',
    displayName: 'Gmail',
    description: 'Email service',
    actions: {
        send_email: { name: 'send_email', displayName: 'Send Email', description: 'Send an email' },
        reply: { name: 'reply', displayName: 'Reply To Thread', description: 'Reply to a thread' },
    },
    triggers: {
        new_email: { name: 'new_email', displayName: 'New Email', description: 'Fires on a new email' },
    },
} as unknown as BlockMetadataSchema

const search = (searchQuery: string, suggestionType: SuggestionType) =>
    blockSearching.search({ blocks: [gmail], searchQuery, suggestionType, categories: undefined })

describe('blockSearching.search', () => {
    it('returns action suggestions when only the block display name matches', () => {
        const [result] = search('gmail', SuggestionType.ACTION)

        expect(result).toBeDefined()
        expect(result.name).toBe('@intelblocks/block-gmail')
        // Regression: a stale Fuse key ('pieceDisplayName') silently matched nothing,
        // leaving this empty. The client then dropped the block from the picker.
        expect(Object.keys(result.actions)).toEqual(['send_email', 'reply'])
    })

    it('returns trigger suggestions when only the block display name matches', () => {
        const [result] = search('gmail', SuggestionType.TRIGGER)

        expect(result).toBeDefined()
        expect(Object.keys(result.triggers)).toEqual(['new_email'])
    })

    it('still matches on an action display name', () => {
        const [result] = search('send email', SuggestionType.ACTION)

        expect(result).toBeDefined()
        expect(Object.keys(result.actions)).toContain('send_email')
    })

    it('does not leak the internal blockDisplayName search field into results', () => {
        const [result] = search('gmail', SuggestionType.ACTION)

        for (const action of Object.values(result.actions)) {
            expect((action as Record<string, unknown>).blockDisplayName).toBeUndefined()
        }
    })

    it('returns every block unfiltered when there is no search query', () => {
        const results = blockSearching.search({
            blocks: [gmail],
            searchQuery: undefined,
            suggestionType: SuggestionType.ACTION,
            categories: undefined,
        })

        expect(results).toHaveLength(1)
    })
})
