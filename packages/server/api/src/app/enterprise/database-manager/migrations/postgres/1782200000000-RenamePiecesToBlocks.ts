import { MigrationInterface, QueryRunner } from 'typeorm'

// Brand rebrand (piece -> block, Phase 4c). Renames the "piece" schema surface to "block":
// two tables, their indices/FK, and the piece* columns across app_connection, trigger_source,
// oauth_app, template, project_plan, platform, and platform_plan.
//
// The CleanRoomBaseline migration was ALSO edited to create block_* directly, so a FRESH database
// already has the block_* names when this runs. To converge both fresh AND already-migrated
// (piece_*) databases without failing, every rename is guarded: it renames only when the OLD
// name still exists (and, for columns, the new one does not). On a fresh DB every guard is false,
// so this migration is a safe no-op. On an existing DB it performs the rename in place, preserving
// all rows. Column DATA VALUES (e.g. block_metadata.blockType 'CUSTOM'/'OFFICIAL') are untouched.
export class RenamePiecesToBlocks1782200000000 implements MigrationInterface {
    name = 'RenamePiecesToBlocks1782200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Tables (guard: rename only if the old table exists and the new one does not).
        await renameTable(queryRunner, 'piece_metadata', 'block_metadata')
        await renameTable(queryRunner, 'piece_tag', 'block_tag')

        // Indices (guard on the old index existing).
        await renameIndex(queryRunner, 'idx_piece_metadata_name_platform_id_version', 'idx_block_metadata_name_platform_id_version')
        await renameIndex(queryRunner, 'idx_oauth_app_platform_id_piece_name', 'idx_oauth_app_platform_id_block_name')
        await renameIndex(queryRunner, 'idx_template_pieces', 'idx_template_blocks')

        // FK constraint on the (now) block_metadata table.
        await renameConstraint(queryRunner, 'block_metadata', 'fk_piece_metadata_file', 'fk_block_metadata_file')

        // Columns (guard: old column exists AND new column does not, per table).
        await renameColumn(queryRunner, 'block_metadata', 'pieceType', 'blockType')
        await renameColumn(queryRunner, 'block_tag', 'pieceName', 'blockName')
        await renameColumn(queryRunner, 'app_connection', 'pieceName', 'blockName')
        await renameColumn(queryRunner, 'app_connection', 'pieceVersion', 'blockVersion')
        await renameColumn(queryRunner, 'trigger_source', 'pieceName', 'blockName')
        await renameColumn(queryRunner, 'trigger_source', 'pieceVersion', 'blockVersion')
        await renameColumn(queryRunner, 'oauth_app', 'pieceName', 'blockName')
        await renameColumn(queryRunner, 'template', 'pieces', 'blocks')
        await renameColumn(queryRunner, 'project_plan', 'piecesFilterType', 'blocksFilterType')
        await renameColumn(queryRunner, 'project_plan', 'pieces', 'blocks')
        await renameColumn(queryRunner, 'platform', 'filteredPieceNames', 'filteredBlockNames')
        await renameColumn(queryRunner, 'platform', 'filteredPieceBehavior', 'filteredBlockBehavior')
        await renameColumn(queryRunner, 'platform', 'pinnedPieces', 'pinnedBlocks')
        await renameColumn(queryRunner, 'platform_plan', 'managePiecesEnabled', 'manageBlocksEnabled')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await renameColumn(queryRunner, 'platform_plan', 'manageBlocksEnabled', 'managePiecesEnabled')
        await renameColumn(queryRunner, 'platform', 'pinnedBlocks', 'pinnedPieces')
        await renameColumn(queryRunner, 'platform', 'filteredBlockBehavior', 'filteredPieceBehavior')
        await renameColumn(queryRunner, 'platform', 'filteredBlockNames', 'filteredPieceNames')
        await renameColumn(queryRunner, 'project_plan', 'blocks', 'pieces')
        await renameColumn(queryRunner, 'project_plan', 'blocksFilterType', 'piecesFilterType')
        await renameColumn(queryRunner, 'template', 'blocks', 'pieces')
        await renameColumn(queryRunner, 'oauth_app', 'blockName', 'pieceName')
        await renameColumn(queryRunner, 'trigger_source', 'blockVersion', 'pieceVersion')
        await renameColumn(queryRunner, 'trigger_source', 'blockName', 'pieceName')
        await renameColumn(queryRunner, 'app_connection', 'blockVersion', 'pieceVersion')
        await renameColumn(queryRunner, 'app_connection', 'blockName', 'pieceName')
        await renameColumn(queryRunner, 'block_tag', 'blockName', 'pieceName')
        await renameColumn(queryRunner, 'block_metadata', 'blockType', 'pieceType')

        await renameConstraint(queryRunner, 'block_metadata', 'fk_block_metadata_file', 'fk_piece_metadata_file')

        await renameIndex(queryRunner, 'idx_block_metadata_name_platform_id_version', 'idx_piece_metadata_name_platform_id_version')
        await renameIndex(queryRunner, 'idx_oauth_app_platform_id_block_name', 'idx_oauth_app_platform_id_piece_name')
        await renameIndex(queryRunner, 'idx_template_blocks', 'idx_template_pieces')

        await renameTable(queryRunner, 'block_metadata', 'piece_metadata')
        await renameTable(queryRunner, 'block_tag', 'piece_tag')
    }
}

// Rename a table only when the old table exists and the new name is free.
async function renameTable(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
    await queryRunner.query(`
        DO $$
        BEGIN
            IF to_regclass('"${from}"') IS NOT NULL AND to_regclass('"${to}"') IS NULL THEN
                ALTER TABLE "${from}" RENAME TO "${to}";
            END IF;
        END $$;
    `)
}

// Rename a column only when the old column exists and the new one does not on that table.
async function renameColumn(queryRunner: QueryRunner, table: string, from: string, to: string): Promise<void> {
    await queryRunner.query(`
        DO $$
        BEGIN
            IF to_regclass('"${table}"') IS NOT NULL
               AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${from}')
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${to}') THEN
                ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}";
            END IF;
        END $$;
    `)
}

// Rename an index only when the old index exists and the new name is free.
async function renameIndex(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
    await queryRunner.query(`
        DO $$
        BEGIN
            IF to_regclass('"${from}"') IS NOT NULL AND to_regclass('"${to}"') IS NULL THEN
                ALTER INDEX "${from}" RENAME TO "${to}";
            END IF;
        END $$;
    `)
}

// Rename a constraint only when the old constraint exists on the given table.
async function renameConstraint(queryRunner: QueryRunner, table: string, from: string, to: string): Promise<void> {
    await queryRunner.query(`
        DO $$
        BEGIN
            IF to_regclass('"${table}"') IS NOT NULL
               AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${from}') THEN
                ALTER TABLE "${table}" RENAME CONSTRAINT "${from}" TO "${to}";
            END IF;
        END $$;
    `)
}
