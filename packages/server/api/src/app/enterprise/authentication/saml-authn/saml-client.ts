// Clean-room implementation — SAML 2.0 service-provider client (capability spec B.3).
// Wraps the samlify library to (a) build the redirect that starts an IdP login and (b)
// parse and cryptographically validate the assertion the IdP posts back, returning the
// resolved identity attributes. Clients are cached per platform because building one
// parses IdP metadata (and may fetch it over the network); the cache is invalidated
// whenever a platform's SAML settings change (platform.service.update).
import { safeHttp } from '@intelblocks/server-utils'
import { IntellisperError, ErrorCode, isNil, SAMLAttributeMapping, SAMLAuthnProviderConfig, tryCatch } from '@intelblocks/shared'
import * as xmlValidator from '@authenio/samlify-node-xmllint'
import * as samlify from 'samlify'
import { resolveSamlAttributes, SamlAttributes } from './saml-attributes'

// samlify requires an XML schema validator to be installed before any assertion is
// parsed; the node-xmllint plugin performs real schema validation (a hardening step —
// without it samlify refuses to validate responses).
samlify.setSchemaValidator(xmlValidator)

// The IdP posts the assertion back as an HTML form (POST binding); the login request that
// starts the flow is sent as a redirect (redirect binding).
const RESPONSE_BINDING = 'post'
const REQUEST_BINDING = 'redirect'
const METADATA_FETCH_TIMEOUT_MS = 10_000
const METADATA_MAX_BYTES = 5 * 1024 * 1024

export type IdpLoginResponse = {
    body: Record<string, unknown>
    query: Record<string, unknown>
}

export type { SamlAttributes } from './saml-attributes'

type SamlClient = {
    getLoginUrl(): string
    parseAndValidateLoginResponse(response: IdpLoginResponse): Promise<SamlAttributes>
}

type CreateArgs = {
    platformId: string
    samlProvider: SAMLAuthnProviderConfig
    acsUrl: string
}

const clientCache = new Map<string, SamlClient>()

export const createSamlClient = async ({ platformId, samlProvider, acsUrl }: CreateArgs): Promise<SamlClient> => {
    const cached = clientCache.get(platformId)
    if (!isNil(cached)) {
        return cached
    }
    const idp = buildIdp(await resolveIdpMetadata(samlProvider.idpMetadata))
    const sp = buildSp(samlProvider.idpCertificate, acsUrl)
    const client = buildClient(idp, sp, samlProvider.attributeMapping)
    clientCache.set(platformId, client)
    return client
}

// Called when a platform's SAML configuration changes so the next login rebuilds from the
// new settings. A no-op when nothing is cached; never throws.
export const invalidateSamlClientCache = (platformId: string): void => {
    clientCache.delete(platformId)
}

function buildClient(
    idp: samlify.IdentityProviderInstance,
    sp: samlify.ServiceProviderInstance,
    attributeMapping: SAMLAttributeMapping | undefined,
): SamlClient {
    return {
        getLoginUrl(): string {
            return sp.createLoginRequest(idp, REQUEST_BINDING).context
        },
        async parseAndValidateLoginResponse(response: IdpLoginResponse): Promise<SamlAttributes> {
            const parsed = await tryCatch(() => sp.parseLoginResponse(idp, RESPONSE_BINDING, {
                body: flattenToStrings(response.body),
                query: flattenToStrings(response.query),
            }))
            if (parsed.error !== null) {
                throw invalidSamlResponse(`Failed to parse SAML response: ${messageOf(parsed.error)}`)
            }
            return resolveSamlAttributes({
                rawAttributes: parsed.data.extract?.attributes,
                mapping: attributeMapping,
            })
        },
    }
}

function buildIdp(metadata: string): samlify.IdentityProviderInstance {
    return samlify.IdentityProvider({
        metadata,
        isAssertionEncrypted: false,
        messageSigningOrder: 'encrypt-then-sign',
        wantLogoutRequestSigned: true,
    })
}

function buildSp(privateKey: string, acsUrl: string): samlify.ServiceProviderInstance {
    return samlify.ServiceProvider({
        entityID: 'Intellisper',
        authnRequestsSigned: false,
        wantMessageSigned: true,
        wantLogoutResponseSigned: true,
        wantLogoutRequestSigned: true,
        privateKey,
        isAssertionEncrypted: true,
        assertionConsumerService: [{
            Binding: samlify.Constants.namespace.binding.post,
            Location: acsUrl,
        }],
        signatureConfig: {},
    })
}

// IdP metadata may be supplied inline (raw XML) or as a URL to fetch. A URL is retrieved
// through the SSRF-guarded HTTP client (admin-supplied, so it must not be able to reach
// internal hosts), with size and time bounds and a content-type sanity check.
async function resolveIdpMetadata(idpMetadata: string): Promise<string> {
    const trimmed = idpMetadata.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
        return idpMetadata
    }
    const fetched = await tryCatch(() => safeHttp.axios.get<string>(trimmed, {
        responseType: 'text',
        timeout: METADATA_FETCH_TIMEOUT_MS,
        maxContentLength: METADATA_MAX_BYTES,
        maxBodyLength: METADATA_MAX_BYTES,
        transformResponse: (data) => data,
    }))
    if (fetched.error !== null) {
        throw invalidSamlResponse(`Failed to fetch IdP metadata from URL: ${messageOf(fetched.error)}`)
    }
    const contentType = String(fetched.data.headers['content-type'] ?? '').toLowerCase()
    if (contentType !== '' && !contentType.includes('xml') && !contentType.includes('text/plain')) {
        throw invalidSamlResponse(`Failed to fetch IdP metadata from URL: unexpected content-type "${contentType}" — expected XML.`)
    }
    return typeof fetched.data.data === 'string' ? fetched.data.data : String(fetched.data.data)
}

// samlify's parseLoginResponse expects flat string values; form/query fields may arrive as
// arrays, so keep the first string of each.
function flattenToStrings(input: Record<string, unknown>): Record<string, string | undefined> {
    return Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, firstString(value)]),
    )
}

function firstString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value
    }
    if (Array.isArray(value)) {
        return value.find((item): item is string => typeof item === 'string')
    }
    return undefined
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function invalidSamlResponse(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.INVALID_SAML_RESPONSE, params: { message } })
}
