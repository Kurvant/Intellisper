import { TlsOptions } from 'node:tls'
import 'pg'
import { isNil, spreadIfDefined } from '@intelblocks/shared'
import { DataSource } from 'typeorm'
// AppSumo migration dropped (clean-room cleanup): feature removed entirely.
import { getEnterpriseMigrations } from '../enterprise/database-manager'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { commonProperties } from './database-connection'
import { Migration } from './migration'
import { CleanRoomBaseline1781764568389 } from './migration/postgres/1781764568389-CleanRoomBaseline'
import { CreateBrowserAgentTables3169900000000 } from './migration/postgres/3169900000000-CreateBrowserAgentTables'
import { BrowserAgentAutomationColumns3169900000001 } from './migration/postgres/3169900000001-BrowserAgentAutomationColumns'
import { SubscriptionPlanTiers3169900000002 } from './migration/postgres/3169900000002-SubscriptionPlanTiers'
import { AiUsageLedger3169900000003 } from './migration/postgres/3169900000003-AiUsageLedger'
import { MemoryVisibilityAndScopes3169900000004 } from './migration/postgres/3169900000004-MemoryVisibilityAndScopes'
import { MemoryEntitlementDecoupling3169900000005 } from './migration/postgres/3169900000005-MemoryEntitlementDecoupling'

const getSslConfig = (): boolean | TlsOptions => {
    const useSsl = system.get(AppSystemProp.POSTGRES_USE_SSL)
    if (useSsl === 'true') {
        return {
            ca: system.get(AppSystemProp.POSTGRES_SSL_CA)?.replace(/\\n/g, '\n'),
        }
    }
    return false
}

// The single authoritative migration list (capability spec I.9). The clean-room baseline (an
// entity-derived migration creating the full core+enterprise schema for a fresh database) is
// concatenated with the enterprise database-manager's incremental migrations, and the whole set
// is ordered by each migration's monotonic timestamp key. There is exactly ONE list here:
// every edition applies it in the same order, and the rollback tooling and the embedded/test
// data store derive from this same function, so ordering can never diverge.
export const getMigrations = (): (new () => Migration)[] => {
    const coreMigrations: (new () => Migration)[] = [
        CleanRoomBaseline1781764568389,
        CreateBrowserAgentTables3169900000000,
        BrowserAgentAutomationColumns3169900000001,
        SubscriptionPlanTiers3169900000002,
        AiUsageLedger3169900000003,
        MemoryVisibilityAndScopes3169900000004,
        MemoryEntitlementDecoupling3169900000005,
    ]
    const allMigrations = [...coreMigrations, ...getEnterpriseMigrations()]
    return allMigrations.sort((a, b) => migrationTimestamp(a) - migrationTimestamp(b))
}

// The migration's monotonic ordering key is the trailing timestamp in its class name (the same
// value TypeORM records as the migration's `timestamp`), guaranteeing a globally-ordered,
// forward-only sequence regardless of the source module a migration is contributed from.
function migrationTimestamp(MigrationClass: new () => Migration): number {
    const match = MigrationClass.name.match(/(\d+)$/)
    return match ? Number.parseInt(match[1], 10) : 0
}


export const createPostgresDataSource = (): DataSource => {
    const migrationConfig: MigrationConfig = {
        migrationsRun: true,
        migrationsTransactionMode: 'each',
        migrations: getMigrations(),
        synchronize: false,
    }

    const url = system.get(AppSystemProp.POSTGRES_URL)

    if (!isNil(url)) {
        return new DataSource({
            type: 'postgres',
            url,
            ssl: getSslConfig(),
            ...spreadIfDefined('poolSize', system.get(AppSystemProp.POSTGRES_POOL_SIZE)),
            ...migrationConfig,
            ...commonProperties,
        })
    }

    const database = system.getOrThrow(AppSystemProp.POSTGRES_DATABASE)
    const host = system.getOrThrow(AppSystemProp.POSTGRES_HOST)
    const password = system.getOrThrow(AppSystemProp.POSTGRES_PASSWORD)
    const serializedPort = system.getOrThrow(AppSystemProp.POSTGRES_PORT)
    const port = Number.parseInt(serializedPort, 10)
    const idleTimeoutMillis = system.getNumberOrThrow(AppSystemProp.POSTGRES_IDLE_TIMEOUT_MS)
    const username = system.getOrThrow(AppSystemProp.POSTGRES_USERNAME)

    return new DataSource({
        type: 'postgres',
        host,
        port,
        username,
        password,
        database,
        ssl: getSslConfig(),
        ...spreadIfDefined('poolSize', system.get(AppSystemProp.POSTGRES_POOL_SIZE)),
        ...commonProperties,
        ...migrationConfig,
        extra: {
            idleTimeoutMillis,
        },
    })
}

type MigrationConfig = {
    migrationsRun?: boolean
    migrationsTransactionMode?: 'all' | 'none' | 'each'
    migrations?: (new () => Migration)[]
    synchronize: false
}
