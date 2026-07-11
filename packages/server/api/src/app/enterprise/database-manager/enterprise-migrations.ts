// Clean-room implementation — enterprise migration set (capability spec I.9 "Migrations").
//
// This module OWNS the enterprise/commercial schema migrations and contributes them to the
// platform's single, authoritative migration list. The base `getMigrations()` concatenates the
// core migrations with these and orders the whole set by the migration's monotonic timestamp
// key, so there is exactly ONE ordered, forward-only sequence that:
//   - every edition applies in the same order (unified, not edition-branched at run time — an
//     edition that does not use an enterprise table still runs its creation migration);
//   - is ordered so enterprise entity-creation runs BEFORE any code path uses those entities;
//   - applies per-migration atomically (the datasource runs with transaction mode 'each') and
//     is idempotent/re-runnable (already-applied migrations are recorded and skipped);
//   - is the same list the rollback tooling and the embedded/test data store derive from, so
//     ordering can never diverge between them.
//
// This replaces the historical `ee/database` migration wiring. New enterprise migrations are
// added here (and nowhere else); their timestamp key keeps the global ordering monotonic.
import { Migration } from '../../database/migration'
import { AddSecretManagerScopeAndName1781800000000 } from './migrations/postgres/1781800000000-AddSecretManagerScopeAndName'
import { DropSigningKeyPrivateKey1781900000000 } from './migrations/postgres/1781900000000-DropSigningKeyPrivateKey'
import { OAuthAppClientSecretToJsonb1782000000000 } from './migrations/postgres/1782000000000-OAuthAppClientSecretToJsonb'
import { AddChatMessageMetric1782100000000 } from './migrations/postgres/1782100000000-AddChatMessageMetric'
import { RenamePiecesToBlocks1782200000000 } from './migrations/postgres/1782200000000-RenamePiecesToBlocks'

export function getEnterpriseMigrations(): (new () => Migration)[] {
    return [
        AddSecretManagerScopeAndName1781800000000,
        DropSigningKeyPrivateKey1781900000000,
        OAuthAppClientSecretToJsonb1782000000000,
        AddChatMessageMetric1782100000000,
        RenamePiecesToBlocks1782200000000,
    ]
}
