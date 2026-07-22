import { BlockMetadataModel } from '@intelblocks/blocks-framework'
import {
    BaseModel,
    IbId,
} from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    COLLATION,
    IbIdSchema,
} from '../../database/database-common'

export type BlockMetadataSchema = BaseModel<IbId> & BlockMetadataModel

export const BlockMetadataEntity =
  new EntitySchema<BlockMetadataSchema>({
      name: 'block_metadata',
      columns: {
          ...BaseColumnSchemaPart,
          name: {
              type: String,
              nullable: false,
          },
          authors: {
              type: String,
              nullable: false,
              array: true,
          },
          displayName: {
              type: String,
              nullable: false,
          },
          logoUrl: {
              type: String,
              nullable: false,
          },
          projectUsage: {
              type: Number,
              nullable: false,
              default: 0,
          },
          description: {
              type: String,
              nullable: true,
          },
          platformId: {
              type: String,
              nullable: true,
          },
          version: {
              type: String,
              nullable: false,
              collation: COLLATION,
          },
          minimumSupportedRelease: {
              type: String,
              nullable: false,
              collation: COLLATION,
          },
          maximumSupportedRelease: {
              type: String,
              nullable: false,
              collation: COLLATION,
          },
          auth: {
              type: 'json',
              nullable: true,
          },
          actions: {
              type: 'json',
              nullable: false,
          },
          triggers: {
              type: 'json',
              nullable: false,
          },
          blockType: {
              type: String,
              nullable: false,
          },
          categories: {
              type: String,
              nullable: true,
              array: true,
          },
          packageType: {
              type: String,
              nullable: false,
          },
          archiveId: {
              ...IbIdSchema,
              nullable: true,
          },
          i18n: {
              type: 'json',
              nullable: true,
          },
      },
      indices: [
          {
              name: 'idx_block_metadata_name_platform_id_version',
              columns: ['name', 'version', 'platformId'],
              unique: true,
          },
      ],
      relations: {
          archiveId: {
              type: 'one-to-one',
              target: 'file', 
              onDelete: 'RESTRICT',
              onUpdate: 'RESTRICT',
              joinColumn: {
                  name: 'archiveId',
                  referencedColumnName: 'id',
                  foreignKeyConstraintName: 'fk_block_metadata_file',
              },
          },
      },
  })
