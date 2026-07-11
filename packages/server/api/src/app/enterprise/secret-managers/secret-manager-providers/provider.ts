// Clean-room implementation — the fixed provider-adapter contract (capability spec E.6).
//
// Every external-secret-store adapter implements the SAME operation set, so the calling code
// (validation, resolution, health checks) is provider-agnostic and new adapters can be added
// without touching it: pick the adapter by its stable provider id and call the contract.
//
//   check-connection : exercise the provider connection live (auth reachable) → boolean.
//   connect          : establish/validate a session and return an opaque session handle.
//   disconnect       : tear down a session (best-effort; never throws for the caller).
//   get-secret       : fetch a single secret value for a provider-defined path.
//   validate-path    : provider-defined path grammar (reject malformed paths up front).
//
// All outbound calls to administrator-supplied endpoints MUST go through the SSRF-guarded
// egress client (see safe-http rule); adapters never use raw axios/fetch for such hosts.
import { SecretManagerProviderConfig, SecretManagerProviderId } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'

export type SecretManagerProvider<TConfig extends SecretManagerProviderConfig = SecretManagerProviderConfig, TSession = unknown> = {
    // The stable provider id this adapter serves.
    readonly id: SecretManagerProviderId

    // Live health check: return true only when the provider is reachable AND the credentials
    // authenticate. A failure returns false (or throws a provider-connection error); it MUST
    // NOT silently report healthy.
    checkConnection(params: { config: TConfig, log: FastifyBaseLogger }): Promise<boolean>

    // Establish a session (authenticate) and return an opaque handle used by getSecret. A
    // failure raises a SECRET_MANAGER_CONNECTION_FAILED error.
    connect(params: { config: TConfig, log: FastifyBaseLogger }): Promise<TSession>

    // Best-effort session teardown. MUST NOT throw.
    disconnect(params: { session: TSession, config: TConfig, log: FastifyBaseLogger }): Promise<void>

    // Fetch one secret value for the provider-defined path. A missing secret / permission
    // failure raises a SECRET_MANAGER_GET_SECRET_FAILED error.
    getSecret(params: { path: string, session: TSession, config: TConfig, log: FastifyBaseLogger }): Promise<string>

    // Validate the provider-defined path grammar; throw a VALIDATION error on a malformed path.
    validatePath(path: string): Promise<void>
}
