import { ibVersionUtil } from '@intelblocks/server-utils'
import { ExecutionMode, Flag, IbEdition, IbFlagId, isNil } from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { federatedAuthnService } from '../enterprise/authentication/federated-authn/federated-authn-service'
import { getEmailSender } from '../enterprise/helper/email/email-sender'
import { domainHelper } from '../helper/domain-helper'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { knowledgeBaseSchema } from '../knowledge-base/knowledge-base-schema'
import { FlagEntity } from './flag.entity'
import { defaultTheme } from './theme'
import { webhookSecretsUtils } from './webhook-secrets-util'

const flagRepo = repoFactory(FlagEntity)

export const flagService = (log: FastifyBaseLogger) => ({
    save: async (flag: FlagType): Promise<Flag> => {
        return flagRepo().save({
            id: flag.id,
            value: flag.value,
        })
    },
    async getOne(flagId: IbFlagId): Promise<Flag | null> {
        return flagRepo().findOneBy({ id: flagId })
    },
    async getAll(): Promise<Flag[]> {
        const flags = await flagRepo().findBy({
            id: In([
                IbFlagId.SHOW_POWERED_BY_IN_FORM,
                IbFlagId.CLOUD_AUTH_ENABLED,
                IbFlagId.CURRENT_VERSION,
                IbFlagId.EDITION,
                IbFlagId.EMAIL_AUTH_ENABLED,
                IbFlagId.EXECUTION_DATA_RETENTION_DAYS,
                IbFlagId.ENVIRONMENT,
                IbFlagId.PUBLIC_URL,
                IbFlagId.LATEST_VERSION,
                IbFlagId.PRIVACY_POLICY_URL,
                IbFlagId.BLOCKS_SYNC_MODE,
                IbFlagId.PRIVATE_BLOCKS_ENABLED,
                IbFlagId.FLOW_RUN_TIME_SECONDS,
                IbFlagId.SHOW_COMMUNITY,
                IbFlagId.SUPPORTED_APP_WEBHOOKS,
                IbFlagId.TELEMETRY_ENABLED,
                IbFlagId.TEMPLATES_PROJECT_ID,
                IbFlagId.TERMS_OF_SERVICE_URL,
                IbFlagId.THEME,
                IbFlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
                IbFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP,
                IbFlagId.SAML_AUTH_ACS_URL,
                IbFlagId.USER_CREATED,
                IbFlagId.WEBHOOK_URL_PREFIX,
                IbFlagId.ALLOW_NPM_PACKAGES_IN_CODE_STEP,
                IbFlagId.MAX_FIELDS_PER_TABLE,
                IbFlagId.MAX_RECORDS_PER_TABLE,
                IbFlagId.MAX_FILE_SIZE_MB,
                IbFlagId.TEMPLATES_CATEGORIES,
            ]),
        })
        const now = dayjs().toISOString()
        const created = now
        const updated = now
        const currentVersion = ibVersionUtil.getCurrentRelease()
        const latestVersion = await ibVersionUtil.getLatestRelease()
        flags.push(
            {
                id: IbFlagId.ENVIRONMENT,
                value: system.get(AppSystemProp.ENVIRONMENT),
                created,
                updated,
            },
            {
                id: IbFlagId.AGENTS_CONFIGURED,
                // TODO (@abuaboud): add new check
                value: true,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_ALERTS,
                value: system.getEdition() !== IbEdition.COMMUNITY,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_PROJECT_MEMBERS,
                value: system.getEdition() !== IbEdition.COMMUNITY,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_BADGES,
                value: true,
                created,
                updated,
            },
            {
                id: IbFlagId.CAN_BUY_ACTIVE_FLOWS,
                value: system.getEdition() === IbEdition.CLOUD,
                created,
                updated,
            },
            {
                id: IbFlagId.CAN_BUY_AI_CREDITS,
                value: !isNil(system.get(AppSystemProp.OPENROUTER_PROVISION_KEY)),
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_BILLING_LIMITS_ON_SIDEBAR,
                value: system.getEdition() === IbEdition.CLOUD,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_BILLING_PAGE,
                value: system.getEdition() === IbEdition.CLOUD,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_POWERED_BY_IN_FORM,
                value: true,
                created,
                updated,
            },
            {
                id: IbFlagId.BLOCKS_SYNC_MODE,
                value: system.get(AppSystemProp.BLOCKS_SYNC_MODE),
                created,
                updated,
            },
            {
                id: IbFlagId.ENABLE_FLOW_ON_PUBLISH,
                value: system.getBoolean(AppSystemProp.ENABLE_FLOW_ON_PUBLISH) ?? true,
                created,
                updated,
            },
            {
                id: IbFlagId.EXECUTION_DATA_RETENTION_DAYS,
                value: system.getNumber(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS),
                created,
                updated,
            },
            {
                id: IbFlagId.CLOUD_AUTH_ENABLED,
                value: system.getBoolean(AppSystemProp.CLOUD_AUTH_ENABLED) ?? true,
                created,
                updated,
            },
            {
                id: IbFlagId.EDITION,
                value: system.getEdition(),
                created,
                updated,
            },
            {
                id: IbFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP,
                value: {},
                created,
                updated,
            },
            {
                id: IbFlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
                value: await federatedAuthnService(log).getThirdPartyRedirectUrl(),
                created,
                updated,
            },
            {
                id: IbFlagId.EMAIL_AUTH_ENABLED,
                value: true,
                created,
                updated,
            },
            {
                id: IbFlagId.THEME,
                value: defaultTheme,
                created,
                updated,
            },
            {
                id: IbFlagId.SHOW_COMMUNITY,
                value: system.getEdition() !== IbEdition.ENTERPRISE,
                created,
                updated,
            },
            {
                id: IbFlagId.PRIVATE_BLOCKS_ENABLED,
                value: system.getEdition() !== IbEdition.COMMUNITY,
                created,
                updated,
            },
            {
                id: IbFlagId.PRIVACY_POLICY_URL,
                value: 'https://intellisper.kurvant.com/privacy',
                created,
                updated,
            },
            {
                id: IbFlagId.TERMS_OF_SERVICE_URL,
                value: 'https://intellisper.kurvant.com/terms',
                created,
                updated,
            },
            {
                id: IbFlagId.TELEMETRY_ENABLED,
                value: system.getBoolean(AppSystemProp.TELEMETRY_ENABLED) ?? false,
                created,
                updated,
            },
            {
                id: IbFlagId.PUBLIC_URL,
                value: await domainHelper.getPublicUrl({
                    path: '',
                }),
                created,
                updated,
            },
            {
                id: IbFlagId.FLOW_RUN_TIME_SECONDS,
                value: system.getNumberOrThrow(AppSystemProp.FLOW_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: IbFlagId.TRIGGER_TIMEOUT_SECONDS,
                value: system.getNumberOrThrow(AppSystemProp.TRIGGER_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: IbFlagId.FLOW_RUN_MEMORY_LIMIT_KB,
                value: system.getNumber(AppSystemProp.SANDBOX_MEMORY_LIMIT),
                created,
                updated,
            },
            {
                id: IbFlagId.FLOW_RUN_LOG_SIZE_LIMIT_MB,
                value: system.getNumber(AppSystemProp.MAX_FLOW_RUN_LOG_SIZE_MB),
                created,
                updated,
            },
            {
                id: IbFlagId.PAUSED_FLOW_TIMEOUT_DAYS,
                value: system.getNumber(AppSystemProp.PAUSED_FLOW_TIMEOUT_DAYS),
                created,
                updated,
            },
            {
                id: IbFlagId.WEBHOOK_TIMEOUT_SECONDS,
                value: system.getNumber(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: IbFlagId.CURRENT_VERSION,
                value: currentVersion,
                created,
                updated,
            },
            {
                id: IbFlagId.LATEST_VERSION,
                value: latestVersion,
                created,
                updated,
            },
            {
                id: IbFlagId.ALLOW_NPM_PACKAGES_IN_CODE_STEP,
                value: system.get(AppSystemProp.EXECUTION_MODE) !== ExecutionMode.SANDBOX_CODE_ONLY,
                created,
                updated,
            },
            {
                id: IbFlagId.MAX_RECORDS_PER_TABLE,
                value: system.getNumber(AppSystemProp.MAX_RECORDS_PER_TABLE),
                created,
                updated,
            },
            {
                id: IbFlagId.MAX_FIELDS_PER_TABLE,
                value: system.getNumber(AppSystemProp.MAX_FIELDS_PER_TABLE),
                created,
                updated,
            },
            {
                id: IbFlagId.MAX_FILE_SIZE_MB,
                value: system.getNumber(AppSystemProp.MAX_FILE_SIZE_MB),
                created,
                updated,
            },
            {
                id: IbFlagId.PROJECT_RATE_LIMITER_ENABLED,
                value: system.getBoolean(AppSystemProp.PROJECT_RATE_LIMITER_ENABLED) ?? false,
                created,
                updated,
            },
            {
                id: IbFlagId.DEFAULT_CONCURRENT_JOBS_LIMIT,
                value: system.getNumber(AppSystemProp.DEFAULT_CONCURRENT_JOBS_LIMIT),
                created,
                updated,
            },
            {
                // Flag id kept for web compatibility; semantics are now "a real email
                // transport (REST or SMTP) is configured".
                id: IbFlagId.SMTP_CONFIGURED,
                value: getEmailSender(log).isConfigured(),
                created,
                updated,
            },
            {
                id: IbFlagId.PGVECTOR_AVAILABLE,
                value: await knowledgeBaseSchema.isVectorExtensionInstalled(),
                created,
                updated,
            },
        )

        if (system.isApp()) {
            flags.push(
                {
                    id: IbFlagId.WEBHOOK_URL_PREFIX,
                    value: await domainHelper.getPublicApiUrl({
                        path: 'v1/webhooks',
                    }),
                    created,
                    updated,
                },
                {
                    id: IbFlagId.SUPPORTED_APP_WEBHOOKS,
                    value: getSupportedAppWebhooks(),
                    created,
                    updated,
                },
            )
        }
        return flags
    },

    aiCreditsEnabled(): boolean {
        return !isNil(system.get(AppSystemProp.OPENROUTER_PROVISION_KEY))
    },
})



function getSupportedAppWebhooks(): string[] {
    const webhookSecrets = system.get(AppSystemProp.APP_WEBHOOK_SECRETS)
    if (isNil(webhookSecrets)) {
        return []
    }
    const parsed = webhookSecretsUtils.parseWebhookSecrets(webhookSecrets)
    return Object.keys(parsed)
}

export type FlagType =
    | BaseFlagStructure<IbFlagId.PUBLIC_URL, string>
    | BaseFlagStructure<IbFlagId.TELEMETRY_ENABLED, boolean>
    | BaseFlagStructure<IbFlagId.USER_CREATED, boolean>
    | BaseFlagStructure<IbFlagId.WEBHOOK_URL_PREFIX, string>
    | BaseFlagStructure<IbFlagId.TEMPLATES_CATEGORIES, string[]>

type BaseFlagStructure<K extends IbFlagId, V> = {
    id: K
    value: V
}
