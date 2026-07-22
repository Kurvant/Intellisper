// Clean-room implementation — the provider registry (capability spec E.6). Resolves a
// provider id to its adapter so the calling code stays provider-agnostic; adding a new
// adapter means registering it here and nowhere else.
import { ErrorCode, IntellisperError, SecretManagerProviderId } from '@intelblocks/shared'
import { awsProvider } from './aws-provider'
import { cyberarkProvider } from './cyberark-provider'
import { hashicorpProvider } from './hashicorp-provider'
import { onePasswordProvider } from './onepassword-provider'
import { SecretManagerProvider } from './provider'

const providers: Record<SecretManagerProviderId, SecretManagerProvider> = {
    [SecretManagerProviderId.HASHICORP]: hashicorpProvider as SecretManagerProvider,
    [SecretManagerProviderId.AWS]: awsProvider as SecretManagerProvider,
    [SecretManagerProviderId.CYBERARK]: cyberarkProvider as SecretManagerProvider,
    [SecretManagerProviderId.ONEPASSWORD]: onePasswordProvider as SecretManagerProvider,
}

export function getSecretManagerProvider(providerId: SecretManagerProviderId): SecretManagerProvider {
    const provider = providers[providerId]
    if (!provider) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: `Unsupported secret manager provider: ${providerId}` },
        })
    }
    return provider
}

export { SecretManagerProvider } from './provider'
