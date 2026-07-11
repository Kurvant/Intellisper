// Clean-room implementation — enterprise data-layer entity registration (capability spec I.9
// "data-layer registration"). This module OWNS the enterprise/commercial persistent entities
// and contributes them to the platform's single entity registry; the base `getEntities()`
// composes the core entities with this list so there is exactly one registry. An unregistered
// entity yields incomplete schema/migrations and a failed start, so this list is a release gate.
//
// Provenance markers ("Enterprise" / "Cloud") are kept for history only — every edition
// registers the same entities (an edition that does not use a table simply leaves it unused),
// consistent with the unified-schema rule of I.9. This replaces the historical `ee/database`
// entity wiring.
import { EntitySchema } from 'typeorm'
import { PlatformAnalyticsReportEntity } from '../../analytics/platform-analytics-report.entity'
import { EventDestinationEntity } from '../../event-destinations/event-destinations.entity'
import { TemplateEntity } from '../../template/template.entity'
import { AlertEntity } from '../alerts/alerts-entity'
import { ApiKeyEntity } from '../api-keys/api-key-entity'
import { AppCredentialEntity } from '../app-credentials/app-credentials.entity'
import { AuditEventEntity } from '../audit-logs/audit-event-entity'
import { OtpEntity } from '../authentication/otp/otp-entity'
import { ChatConversationEntity } from '../chat/chat-conversation-entity'
import { ChatMessageMetricEntity } from '../chat/telemetry/chat-message-metric.entity'
import { ConnectionKeyEntity } from '../connection-keys/connection-key.entity'
import { EmbedSubdomainEntity } from '../embed-subdomain/embed-subdomain.entity'
import { OAuthAppEntity } from '../oauth-apps/oauth-app.entity'
import { ConcurrencyPoolEntity } from '../platform/concurrency-pool/concurrency-pool.entity'
import { PlatformPlanEntity } from '../platform/platform-plan/platform-plan.entity'
import { ProjectMemberEntity } from '../projects/project-members/project-member.entity'
import { ProjectPlanEntity } from '../projects/project-plan/project-plan.entity'
import { GitRepoEntity } from '../projects/project-release/git-sync/git-sync.entity'
import { ProjectReleaseEntity } from '../projects/project-release/project-release.entity'
import { ProjectRoleEntity } from '../projects/project-role/project-role.entity'
import { SecretManagerEntity } from '../secret-managers/secret-manager.entity'
import { SigningKeyEntity } from '../signing-key/signing-key-entity'

export function getEnterpriseEntities(): EntitySchema<unknown>[] {
    return [
        // Enterprise
        ConcurrencyPoolEntity,
        ProjectMemberEntity,
        ProjectPlanEntity,
        SigningKeyEntity,
        OAuthAppEntity,
        OtpEntity,
        ApiKeyEntity,
        TemplateEntity,
        GitRepoEntity,
        AuditEventEntity,
        ProjectReleaseEntity,
        ProjectRoleEntity,
        AlertEntity,
        SecretManagerEntity,
        ChatConversationEntity,
        ChatMessageMetricEntity,
        EmbedSubdomainEntity,
        PlatformAnalyticsReportEntity,
        // Cloud
        ConnectionKeyEntity,
        AppCredentialEntity,
        PlatformPlanEntity,
        EventDestinationEntity,
    ] as EntitySchema<unknown>[]
}
