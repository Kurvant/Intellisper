import { ActionBase, TriggerBase } from '@intelblocks/blocks-framework'

import {
    BlockCategory,
    SuggestionType,
} from '@intelblocks/shared'
import Fuse from 'fuse.js'
import { BlockMetadataSchema } from '../piece-metadata-entity'

export const blockSearching = {
    search: (params: SearchParams): BlockMetadataSchema[] => {
        return filterBasedOnCategories(params.categories, filterBasedOnSearchQuery(params))
    },
}

type SearchParams = {
    categories: BlockCategory[] | undefined
    searchQuery: string | undefined
    blocks: BlockMetadataSchema[]
    suggestionType?: SuggestionType
}


const filterBasedOnSearchQuery = ({ searchQuery, blocks, suggestionType }: SearchParams): BlockMetadataSchema[] => {
    if (!searchQuery) {
        return blocks
    }
    const putActionsAndTriggersInAnArray = blocks.map((block) => {
        const actions = suggestionType === SuggestionType.ACTION ||
                    suggestionType === SuggestionType.ACTION_AND_TRIGGER
            ? Object.values(block.actions)
            : []

        const triggers = suggestionType === SuggestionType.TRIGGER ||
                    suggestionType === SuggestionType.ACTION_AND_TRIGGER
            ? Object.values(block.triggers)
            : []
        return {
            ...block,
            actions,
            triggers,
        }
    })

    const blockWithTriggersAndActionsFilterKeys = [
        {
            name: 'displayName',
            weight: 3,
        },
        {
            name: 'description',
            weight: 1,
        },
        'actions.displayName',
        'actions.description',
        'triggers.displayName',
        'triggers.description',
    ]

    const fuse = new Fuse(putActionsAndTriggersInAnArray, {
        isCaseSensitive: false,
        shouldSort: true,
        keys: blockWithTriggersAndActionsFilterKeys,
        threshold: 0.2,
        distance: 250,
    })

    return fuse.search(searchQuery).map(({ item }) => {
        const suggestedActions = searchForSuggestion(
            item.actions,
            searchQuery,
            item.displayName,
        )
        const suggestedTriggers = searchForSuggestion(
            item.triggers,
            searchQuery,
            item.displayName,
        )

        return {
            ...item,
            actions: suggestedActions,
            triggers: suggestedTriggers,
        }
    })
}

const filterBasedOnCategories = (categories: BlockCategory[] | undefined, blocks: BlockMetadataSchema[]): BlockMetadataSchema[] => {
    if (!categories) {
        return blocks
    }

    return blocks.filter((p) => {
        return categories.some((item) => (p.categories ?? []).includes(item))
    })
}

function searchForSuggestion<T extends ActionBase | TriggerBase>(
    actionsOrTriggers: T[],
    searchQuery: string,
    blockDisplayName: string,
): Record<string, T> {
    const actionsOrTriggerWithBlockDisplayName = actionsOrTriggers.map(
        (actionOrTrigger) => ({
            ...actionOrTrigger,
            blockDisplayName,
        }),
    )

    const nestedFuse = new Fuse(actionsOrTriggerWithBlockDisplayName, {
        isCaseSensitive: false,
        shouldSort: true,
        // Must match the field set above. Searching a key that does not exist on the
        // items silently contributes nothing, which would drop every block whose own
        // actions/triggers happen not to fuzzy-match the query — even when the block
        // itself matched by display name.
        keys: ['blockDisplayName', 'displayName', 'description'],
        threshold: 0.2,
    })
    const suggestions = nestedFuse.search(searchQuery)
    return suggestions.reduce<Record<string, T>>(
        (filteredSuggestions, { item }) => {
            filteredSuggestions[item.name] = {
                ...item,
                blockDisplayName: undefined,
            }
            return filteredSuggestions
        },
        {},
    )
}
