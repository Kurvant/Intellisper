import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * Schema presence test for the browser-agent entities.
 *
 * IMPORTANT — what this DOES and does NOT cover. The API test harness runs on **PGLite** (an
 * in-process WASM Postgres) with `runMigrations: false`; it builds the schema by SYNCHRONIZING
 * from the registered entities, NOT by executing the SQL migration. PGLite also has no `vector`
 * extension. So this test asserts the ENTITY registration is correct (all 15 agent tables
 * synchronize, existing core tables are untouched) — it deliberately does NOT assert the
 * migration-only artifacts (pgvector embedding column, the `user`/`platform_plan` ALTER columns),
 * which don't exist on the synchronize path.
 *
 * The actual SQL migration (`3169900000000-CreateBrowserAgentTables`) is verified END-TO-END
 * against the real pgvector Postgres out-of-harness (documented in the Phase-1 progress log):
 * up() + idempotent re-run + down() all clean, with the vector column, HNSW index, FKs, and the
 * sharing ALTER columns all confirmed present. That is the migration's proof; this is the
 * entity-registration proof.
 */

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function tableExists(name: string): Promise<boolean> {
    const rows = await databaseConnection().query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
        [name],
    )
    return rows.length > 0
}

const AGENT_TABLES = [
    'browser_agent_conversation',
    'browser_agent_message',
    'browser_agent_run',
    'browser_agent_action',
    'browser_agent_memory_fact',
    'browser_agent_memory_entity',
    'browser_agent_memory_relation',
    'browser_agent_routine',
    'browser_agent_routine_step',
    'browser_agent_routine_run',
    'browser_agent_batch_job',
    'browser_agent_schedule',
    'browser_agent_file',
    'browser_agent_audit_log',
    'browser_agent_usage_counter',
]

describe('Browser Agent entities (Phase 1 — schema registration)', () => {
    it('all 15 browser-agent entities are registered and synchronize into tables', async () => {
        for (const table of AGENT_TABLES) {
            expect(await tableExists(table), `table ${table} should exist`).toBe(true)
        }
    })

    it('leaves existing core blockunits schema intact (no damage)', async () => {
        for (const table of ['flow', 'project', 'platform', 'user', 'flow_run', 'app_connection']) {
            expect(await tableExists(table), `existing table ${table} must remain`).toBe(true)
        }
    })

    it('memory_fact registers its scoping columns (platformId, userId) but NOT the vector column via synchronize', async () => {
        const cols: Array<{ column_name: string }> = await databaseConnection().query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'browser_agent_memory_fact'`,
        )
        const names = cols.map((c) => c.column_name)
        expect(names).toContain('platformId')
        expect(names).toContain('userId')
        // The vector `embedding` column is migration-only (see file header) — absent on synchronize.
        expect(names).not.toContain('embedding')
    })
})
