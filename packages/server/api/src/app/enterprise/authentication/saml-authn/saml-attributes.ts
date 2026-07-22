// Clean-room implementation — SAML assertion attribute resolution (capability spec B.3).
// An IdP returns a bag of claims whose keys vary by vendor (plain names, the lowercase
// Entra variants, or the long WS-Federation claim URIs). This maps that bag onto the three
// fields the platform needs — email, first name, last name — using a per-field list of
// accepted keys, with an optional admin-supplied override that takes precedence. Values
// may arrive as single-element arrays (how samlify surfaces them); those are flattened.
// If any required field cannot be resolved the whole response is rejected, because a
// partial identity must never be trusted for provisioning.
import { ErrorCode, IntellisperError, isNil, SAMLAttributeMapping } from '@intelblocks/shared'

export type SamlAttributes = {
    email: string
    firstName: string
    lastName: string
}

type Field = keyof SamlAttributes

// Keys accepted for each field when no override is configured, in priority order:
// the plain name, the lowercase Entra variant(s), then the WS-Federation claim URI.
const DEFAULT_KEYS: Record<Field, readonly string[]> = {
    email: [
        'email',
        'emailaddress',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    ],
    firstName: [
        'firstName',
        'firstname',
        'givenname',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    ],
    lastName: [
        'lastName',
        'lastname',
        'surname',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    ],
}

type ResolveArgs = {
    rawAttributes: Record<string, unknown> | null | undefined
    mapping?: SAMLAttributeMapping
}

export const resolveSamlAttributes = ({ rawAttributes, mapping }: ResolveArgs): SamlAttributes => {
    const attributes = rawAttributes ?? {}
    const resolved: Partial<SamlAttributes> = {
        email: resolveField('email', attributes, mapping),
        firstName: resolveField('firstName', attributes, mapping),
        lastName: resolveField('lastName', attributes, mapping),
    }

    const missing = (Object.keys(DEFAULT_KEYS) as Field[]).filter((field) => isNil(resolved[field]))
    if (missing.length > 0) {
        throw invalidResponse(missing, Object.keys(attributes))
    }
    return resolved as SamlAttributes
}

// Try each accepted key for a field in priority order and return the first non-empty
// value. A configured override is tried first; a blank/whitespace override is treated as
// unset, and a present-but-absent override falls through to the defaults.
function resolveField(field: Field, attributes: Record<string, unknown>, mapping?: SAMLAttributeMapping): string | undefined {
    const override = mapping?.[field]?.trim()
    const keys = isNil(override) || override.length === 0
        ? DEFAULT_KEYS[field]
        : [override, ...DEFAULT_KEYS[field]]

    for (const key of keys) {
        const value = firstNonEmpty(attributes[key])
        if (!isNil(value)) {
            return value
        }
    }
    return undefined
}

// Accept a string, or the first non-empty string of an array (samlify multi-value shape).
// Anything else (null, empty string, non-string) is treated as absent.
function firstNonEmpty(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return value.map(firstNonEmpty).find((v) => !isNil(v))
    }
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function invalidResponse(missing: string[], receivedKeys: string[]): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.INVALID_SAML_RESPONSE,
        params: {
            message: `Invalid SAML response. Missing required field(s): ${missing.join(', ')}. `
                + `Received attribute keys: [${receivedKeys.join(', ')}]. `
                + 'Configure attributeMapping in SSO settings if your IdP uses non-standard claim names.',
        },
    })
}
