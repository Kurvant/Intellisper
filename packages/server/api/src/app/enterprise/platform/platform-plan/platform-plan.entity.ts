// Clean-room entity. Field set derived from the MIT shared type `PlatformPlan`
// (packages/shared/.../management/platform/platform.model.ts) — NOT from any
// licensed source. One plan row per platform (1:1).
import { AiCreditsAutoTopUpState, Platform, PlatformPlan, TeamProjectsLimit } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../../database/database-common'

type PlatformPlanSchema = PlatformPlan & {
    platform: Platform
}

export const PlatformPlanEntity = new EntitySchema<PlatformPlanSchema>({
    name: 'platform_plan',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        plan: {
            type: String,
            nullable: true,
        },
        includedAiCredits: {
            type: Number,
            nullable: false,
        },
        lastFreeAiCreditsRenewalDate: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        tablesEnabled: { type: Boolean, nullable: false },
        eventStreamingEnabled: { type: Boolean, nullable: false },
        aiCreditsAutoTopUpState: {
            type: String,
            enum: AiCreditsAutoTopUpState,
            nullable: false,
        },
        aiCreditsAutoTopUpThreshold: { type: Number, nullable: true },
        aiCreditsAutoTopUpCreditsToAdd: { type: Number, nullable: true },
        maxAutoTopUpCreditsMonthly: { type: Number, nullable: true },
        environmentsEnabled: { type: Boolean, nullable: false },
        analyticsEnabled: { type: Boolean, nullable: false },
        showPoweredBy: { type: Boolean, nullable: false },
        auditLogEnabled: { type: Boolean, nullable: false },
        embeddingEnabled: { type: Boolean, nullable: false },
        agentsEnabled: { type: Boolean, nullable: false },
        aiProvidersEnabled: { type: Boolean, nullable: false },
        chatEnabled: { type: Boolean, nullable: false },
        dataManipulationEnabled: { type: Boolean, nullable: false },
        manageBlocksEnabled: { type: Boolean, nullable: false },
        manageTemplatesEnabled: { type: Boolean, nullable: false },
        customAppearanceEnabled: { type: Boolean, nullable: false },
        teamProjectsLimit: {
            type: String,
            enum: TeamProjectsLimit,
            nullable: false,
        },
        projectRolesEnabled: { type: Boolean, nullable: false },
        globalConnectionsEnabled: { type: Boolean, nullable: false },
        customRolesEnabled: { type: Boolean, nullable: false },
        apiKeysEnabled: { type: Boolean, nullable: false },
        ssoEnabled: { type: Boolean, nullable: false },
        secretManagersEnabled: { type: Boolean, nullable: false },
        scimEnabled: { type: Boolean, nullable: false },
        licenseKey: { type: String, nullable: true },
        licenseExpiresAt: { type: 'timestamp with time zone', nullable: true },
        stripeCustomerId: { type: String, nullable: true },
        stripeSubscriptionId: { type: String, nullable: true },
        stripeSubscriptionStatus: { type: String, nullable: true },
        stripeSubscriptionStartDate: { type: Number, nullable: true },
        stripeSubscriptionEndDate: { type: Number, nullable: true },
        stripeSubscriptionCancelDate: { type: Number, nullable: true },
        projectsLimit: { type: Number, nullable: true },
        activeFlowsLimit: { type: Number, nullable: true },
        // @deprecated retained for backwards compatibility with the MIT type.
        dedicatedWorkers: { type: 'jsonb', nullable: true },
        canary: { type: Boolean, nullable: false },
        customDomainsEnabled: { type: Boolean, nullable: false },
        workerGroupId: { type: String, nullable: true },
    },
    indices: [
        {
            name: 'idx_platform_plan_platform_id',
            columns: ['platformId'],
            unique: true,
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_platform_plan_platform_id',
            },
        },
    },
})
