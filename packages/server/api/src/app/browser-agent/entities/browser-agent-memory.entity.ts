import { MemoryEntity, MemoryFact, MemoryRelation } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type MemoryRelationSchema = MemoryRelation & { fromEntity: MemoryEntity, toEntity: MemoryEntity }

/**
 * Memory tables. ALWAYS strictly private to (platformId, userId) — never sharable under any
 * switch. The `embedding vector(N)` column on memory_fact is intentionally NOT declared here
 * (TypeORM has no vector type); it is created in the migration and all vector I/O is raw SQL in
 * the memory service. `embeddingModel` records which model produced the vector (dimension guard).
 */

export const MemoryFactEntity = new EntitySchema<MemoryFact>({
    name: 'browser_agent_memory_fact',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        scope: { type: String, nullable: false },
        /** Set only for FLOW-scoped (Studio per-flow) facts. */
        flowId: { ...IbIdSchema, nullable: true },
        /**
         * Per-fact admin-visibility mark: 'PRIVATE' (default — never admin-visible, whatever the
         * other switches say) or 'SHARED' (visible ONLY while the platform unlock AND the owner's
         * opt-in are also on). See shared `MemoryVisibility`.
         */
        visibility: { type: String, nullable: false, default: 'PRIVATE' },
        kind: { type: String, nullable: false },
        content: { type: 'text', nullable: false },
        source: { type: String, nullable: false },
        embeddingModel: { type: String, nullable: true },
        deletedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_memory_fact_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_memory_fact_user_kind', columns: ['userId', 'kind'], unique: false },
        { name: 'idx_ba_memory_fact_platform_scope', columns: ['platformId', 'scope'], unique: false },
    ],
})

export const MemoryEntityEntity = new EntitySchema<MemoryEntity>({
    name: 'browser_agent_memory_entity',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        type: { type: String, nullable: false },
        name: { type: String, nullable: false },
        attributes: { type: 'jsonb', nullable: true },
        deletedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_memory_entity_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_memory_entity_user_type_name', columns: ['userId', 'type', 'name'], unique: false },
    ],
})

export const MemoryRelationEntity = new EntitySchema<MemoryRelationSchema>({
    name: 'browser_agent_memory_relation',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        fromEntityId: { ...IbIdSchema, nullable: false },
        toEntityId: { ...IbIdSchema, nullable: false },
        relation: { type: String, nullable: false },
    },
    indices: [
        { name: 'idx_ba_memory_relation_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_memory_relation_from', columns: ['fromEntityId'], unique: false },
    ],
    relations: {
        fromEntity: {
            type: 'many-to-one',
            target: 'browser_agent_memory_entity',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'fromEntityId',
                foreignKeyConstraintName: 'fk_ba_memory_relation_from',
            },
        },
        toEntity: {
            type: 'many-to-one',
            target: 'browser_agent_memory_entity',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'toEntityId',
                foreignKeyConstraintName: 'fk_ba_memory_relation_to',
            },
        },
    },
})
