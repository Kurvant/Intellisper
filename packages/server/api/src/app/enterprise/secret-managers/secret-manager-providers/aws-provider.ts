// Clean-room implementation — AWS Secrets Manager adapter (capability spec E.6). Built
// against the vendor's public SDK (@aws-sdk/client-secrets-manager). AWS is a fixed vendor
// endpoint (not an administrator-supplied host), so the SDK's own signed HTTP client is used.
//
// Path grammar (provider-defined): `<secret-name>:<json-key>` — the secret name and the field
// to extract from that secret's JSON value.
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import {
    AWSProviderConfig,
    ErrorCode,
    IntellisperError,
    isNil,
    SecretManagerProviderId,
} from '@intelblocks/shared'
import { SecretManagerProvider } from './provider'

type AwsSession = {
    client: SecretsManagerClient
}

function createClient(config: AWSProviderConfig): SecretsManagerClient {
    return new SecretsManagerClient({
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    })
}

function parsePath(path: string): { secretName: string, jsonKey: string } {
    const separatorIndex = path.indexOf(':')
    if (separatorIndex < 0) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'AWS secret path must be of the form <secret-name>:<json-key>.' },
        })
    }
    const secretName = path.slice(0, separatorIndex)
    const jsonKey = path.slice(separatorIndex + 1)
    if (secretName.length === 0 || jsonKey.length === 0) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'AWS secret path must be of the form <secret-name>:<json-key>.' },
        })
    }
    return { secretName, jsonKey }
}

export const awsProvider: SecretManagerProvider<AWSProviderConfig, AwsSession> = {
    id: SecretManagerProviderId.AWS,

    async checkConnection({ config, log }) {
        const client = createClient(config)
        try {
            // A cheap, permission-light call that authenticates the credentials.
            await client.send(new ListSecretsCommand({ MaxResults: 1 }))
            return true
        }
        catch (error) {
            log.warn({ error }, '[AwsProvider] checkConnection failed')
            throw new IntellisperError({
                code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
                params: {
                    provider: SecretManagerProviderId.AWS,
                    message: error instanceof Error ? error.message : 'AWS Secrets Manager authentication failed',
                },
            })
        }
        finally {
            client.destroy()
        }
    },

    async connect({ config }) {
        return { client: createClient(config) }
    },

    async disconnect({ session }) {
        session.client.destroy()
    },

    async getSecret({ path, session, log }) {
        const { secretName, jsonKey } = parsePath(path)
        try {
            const response = await session.client.send(new GetSecretValueCommand({ SecretId: secretName }))
            const raw = response.SecretString
            if (isNil(raw)) {
                throw new Error(`Secret "${secretName}" has no string value`)
            }
            const parsed = JSON.parse(raw) as Record<string, unknown>
            const value = parsed[jsonKey]
            if (isNil(value)) {
                throw new Error(`Key "${jsonKey}" not found in secret "${secretName}"`)
            }
            return typeof value === 'string' ? value : JSON.stringify(value)
        }
        catch (error) {
            log.warn({ error, path }, '[AwsProvider] getSecret failed')
            throw new IntellisperError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: {
                    provider: SecretManagerProviderId.AWS,
                    message: error instanceof Error ? error.message : 'Failed to read secret from AWS Secrets Manager',
                    request: { path },
                },
            })
        }
    },

    async validatePath(path) {
        parsePath(path)
    },
}
