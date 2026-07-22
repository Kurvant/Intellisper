import { safeHttp } from '@intelblocks/server-utils'
import {
    ErrorCode,
    IntellisperError,
    isNil,
    ListTemplatesRequestQuery,
    SeekPage,
    Template,
} from '@intelblocks/shared'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

/**
 * Community template marketplace loader. Upstream this was hardcoded to
 * cloud.activepieces.com — every template browse/fetch relayed to ActivePieces.
 * This edition ships no hardcoded host: the source is operator-controlled via
 * AP_TEMPLATES_SOURCE_URL and defaults to unset, in which case no outbound
 * request is made and the marketplace is simply empty.
 *
 * The source URL is operator/admin config, so every outbound call goes through the
 * SSRF-guarded HTTP client (per the safe-http rule) rather than a raw fetch — the
 * DNS-lookup-to-connect TOCTOU window and private/link-local/metadata IPs are rejected.
 */
function getTemplatesSourceUrl(): string | undefined {
    const url = system.get(AppSystemProp.TEMPLATES_SOURCE_URL)
    if (isNil(url) || url.trim().length === 0) {
        return undefined
    }
    return url.replace(/\/+$/, '')
}

export const communityTemplates = {
    getOrThrow: async (id: string): Promise<Template> => {
        const baseUrl = getTemplatesSourceUrl()
        if (isNil(baseUrl)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'template',
                    entityId: id,
                    message: `Template ${id} not found (no template source configured)`,
                },
            })
        }
        try {
            const response = await safeHttp.retryingAxios.get<Template>(`${baseUrl}/${id}`, {
                headers: { 'content-type': 'application/json' },
            })
            return response.data
        }
        catch (error) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'template',
                    entityId: id,
                    message: `Template ${id} not found`,
                },
            })
        }
    },
    getCategories: async (): Promise<string[]> => {
        const baseUrl = getTemplatesSourceUrl()
        if (isNil(baseUrl)) {
            return []
        }
        try {
            const response = await safeHttp.retryingAxios.get<string[]>(`${baseUrl}/categories`, {
                headers: { 'content-type': 'application/json' },
            })
            return response.data
        }
        catch (error) {
            return []
        }
    },
    list: async (request: ListTemplatesRequestQuery): Promise<SeekPage<Template>> => {
        const baseUrl = getTemplatesSourceUrl()
        if (isNil(baseUrl)) {
            return { data: [], next: null, previous: null }
        }
        const queryString = convertToQueryString(request)
        try {
            const response = await safeHttp.retryingAxios.get<SeekPage<Template>>(`${baseUrl}?${queryString}`, {
                headers: { 'content-type': 'application/json' },
            })
            return response.data
        }
        catch (error) {
            return { data: [], next: null, previous: null }
        }
    },
}


function convertToQueryString(params: ListTemplatesRequestQuery): string {
    const searchParams = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((val) => {
                if (!isNil(val)) {
                    searchParams.append(key, typeof val === 'string' ? val : JSON.stringify(val))
                }
            })
        }
        else if (!isNil(value)) {
            searchParams.set(key, value.toString())
        }
    })

    return searchParams.toString()
}
