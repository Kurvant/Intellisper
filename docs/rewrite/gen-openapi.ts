/**
 * Regenerate docs/openapi.json from the LIVE server route schemas — the source of truth.
 *
 * It mirrors main.ts up to setupServer() (real setupApp registration, so the spec is authoritative),
 * then uses Fastify's in-process app.inject() to fetch GET /api/v1/docs instead of listen()ing on a
 * port or running appPostBoot(). Requires Postgres + Redis to be reachable (they are, in dev).
 *
 * Run:  cd packages/server/api && \
 *       export $(grep -v '^#' ../../../.env.dev | xargs) && \
 *       IB_ENVIRONMENT=dev bunx tsx ../../../docs/rewrite/gen-openapi.ts
 *
 * Writes: docs/openapi.json (pretty-printed). Behaviour-inert: reads schemas only, never mutates data.
 */
import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import { initializeDatabase } from '../../packages/server/api/src/app/database'
import { distributedLock } from '../../packages/server/api/src/app/database/redis-connections'
import { system } from '../../packages/server/api/src/app/helper/system/system'
import { setupServer } from '../../packages/server/api/src/app/server'

async function main(): Promise<void> {
    process.env.TZ = 'UTC'

    // Same DB init main.ts performs (migrations already applied in dev; this is idempotent).
    await distributedLock(system.globalLogger()).runExclusive({
        key: 'database-migration-lock',
        timeoutInSeconds: dayjs.duration(10, 'minutes').asSeconds(),
        fn: async () => initializeDatabase({ runMigrations: true }),
    })

    const app = await setupServer()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/v1/docs' })
    if (res.statusCode !== 200) {
        throw new Error(`GET /api/v1/docs -> ${res.statusCode}: ${res.body.slice(0, 500)}`)
    }
    const spec = JSON.parse(res.body)

    const outPath = path.resolve(__dirname, '..', 'openapi.json')
    fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n')

    const opCount = Object.values(spec.paths ?? {}).reduce(
        (n: number, ops: any) => n + Object.keys(ops).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length,
        0,
    )
    const tags = new Set<string>()
    for (const ops of Object.values(spec.paths ?? {}) as any[]) {
        for (const op of Object.values(ops) as any[]) {
            for (const t of op?.tags ?? []) tags.add(t)
        }
    }
    // eslint-disable-next-line no-console
    console.log(`wrote ${outPath}\n  operations: ${opCount}\n  tags: ${[...tags].sort().join(', ')}`)

    await app.close()
    process.exit(0)
}

main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
})
