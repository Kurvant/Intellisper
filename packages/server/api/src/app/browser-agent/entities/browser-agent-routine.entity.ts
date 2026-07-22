import { Routine, RoutineRun, RoutineStep } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type RoutineStepSchema = RoutineStep & { routine: Routine }
type RoutineRunSchema = RoutineRun & { routine: Routine }

/**
 * Routine = a saved, replayable browser task (renamed from the source "workflow" to avoid the
 * blockunits Flow collision). Scoped by platformId + userId; sharable subject to the switches.
 */

export const RoutineEntity = new EntitySchema<Routine>({
    name: 'browser_agent_routine',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        name: { type: String, nullable: false },
        description: { type: String, nullable: true },
        params: { type: 'jsonb', nullable: false, default: '[]' },
        version: { type: Number, nullable: false, default: 1 },
        deletedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_routine_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_routine_project', columns: ['projectId'], unique: false },
    ],
})

export const RoutineStepEntity = new EntitySchema<RoutineStepSchema>({
    name: 'browser_agent_routine_step',
    columns: {
        ...BaseColumnSchemaPart,
        routineId: { ...IbIdSchema, nullable: false },
        ordinal: { type: Number, nullable: false },
        action: { type: String, nullable: false },
        locators: { type: 'jsonb', nullable: false },
        intent: { type: 'text', nullable: false },
        config: { type: 'jsonb', nullable: true },
    },
    indices: [
        { name: 'idx_ba_routine_step_routine', columns: ['routineId'], unique: false },
    ],
    relations: {
        routine: {
            type: 'many-to-one',
            target: 'browser_agent_routine',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'routineId',
                foreignKeyConstraintName: 'fk_ba_routine_step_routine',
            },
        },
    },
})

export const RoutineRunEntity = new EntitySchema<RoutineRunSchema>({
    name: 'browser_agent_routine_run',
    columns: {
        ...BaseColumnSchemaPart,
        routineId: { ...IbIdSchema, nullable: false },
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        batchJobId: { ...IbIdSchema, nullable: true },
        rowIndex: { type: Number, nullable: true },
        paramValues: { type: 'jsonb', nullable: true },
        agentRunId: { ...IbIdSchema, nullable: true },
        status: { type: String, nullable: false },
        progress: { type: 'jsonb', nullable: true },
        startedAt: { type: 'timestamp with time zone', nullable: true },
        endedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_routine_run_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_routine_run_routine', columns: ['routineId'], unique: false },
        { name: 'idx_ba_routine_run_batch', columns: ['batchJobId'], unique: false },
    ],
    relations: {
        routine: {
            type: 'many-to-one',
            target: 'browser_agent_routine',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'routineId',
                foreignKeyConstraintName: 'fk_ba_routine_run_routine',
            },
        },
    },
})
