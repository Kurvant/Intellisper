import { BlockMetadataModelSummary } from '@intelblocks/blocks-framework';
import { BlockType } from '@intelblocks/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { Package, Trash, Puzzle, Tag, Hash, GitBranch } from 'lucide-react';
import { useMemo, useState } from 'react';

import { RequestTrial } from '@/app/components/request-trial';
import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { DataTableInputPopover } from '@/components/custom/data-table/data-table-input-popover';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { LockedAlert } from '@/components/custom/locked-alert';
import { Button } from '@/components/ui/button';
import { blocksApi, BlockIcon, blocksHooks } from '@/features/pieces';
import { platformHooks } from '@/hooks/platform-hooks';

import { ManageBlocksDialog } from './manage-pieces-dialog';

const columns: ColumnDef<RowDataWithActions<BlockMetadataModelSummary>>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('Block')} icon={Puzzle} />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left">
          <BlockIcon
            size={'sm'}
            border={true}
            displayName={row.original.displayName}
            logoUrl={row.original.logoUrl}
            showTooltip={false}
          />
        </div>
      );
    },
  },
  {
    accessorKey: 'displayName',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Display Name')}
        icon={Tag}
      />
    ),
    cell: ({ row }) => {
      return <div className="text-left">{row.original.displayName}</div>;
    },
  },
  {
    accessorKey: 'packageName',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Package Name')}
        icon={Hash}
      />
    ),
    cell: ({ row }) => {
      return <div className="text-left">{row.original.name}</div>;
    },
  },
  {
    accessorKey: 'version',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Version')}
        icon={GitBranch}
      />
    ),
    cell: ({ row }) => {
      return <div className="text-left">{row.original.version}</div>;
    },
  },
  {
    accessorKey: 'actions',
    header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
    cell: ({ row }) => {
      if (row.original.blockType !== BlockType.CUSTOM) {
        return null;
      }
      return (
        <ConfirmationDeleteDialog
          title={t('Delete {name}', { name: row.original.name })}
          entityName={t('Block')}
          message={t(
            'This will permanently delete this block, all steps using it will fail.',
          )}
          mutationFn={async () => {
            row.original.delete();
            await blocksApi.delete(row.original.id!);
          }}
        >
          <div className="flex items-end justify-end">
            <Button variant="ghost" className="size-8 p-0">
              <Trash className="size-4 text-destructive" />
            </Button>
          </div>
        </ConfirmationDeleteDialog>
      );
    },
  },
];

const BlocksSettings = () => {
  const { platform } = platformHooks.useCurrentPlatform();
  const [searchQuery, setSearchQuery] = useState('');
  const { blocks, isLoading, refetch } = blocksHooks.useBlocks({
    searchQuery,
    isTableQuery: true,
  });

  const toolbarButtons = useMemo(
    () => [<ManageBlocksDialog key="manage" onSuccess={() => refetch()} />],
    [refetch],
  );

  const customFilters = useMemo(
    () => [
      <DataTableInputPopover
        key="search"
        title={t('Block Name')}
        filterValue={searchQuery}
        handleFilterChange={setSearchQuery}
      />,
    ],
    [searchQuery],
  );

  return (
    <div className="space-y-6">
      {!platform.plan.manageBlocksEnabled && (
        <LockedAlert
          title={t('Control Blocks')}
          description={t(
            "Show the blocks that matter most to your users and hide the ones you don't like.",
          )}
          button={
            <RequestTrial
              featureKey="ENTERPRISE_PIECES"
              buttonVariant="basic"
            />
          }
        />
      )}
      <DataTable
        emptyStateTextTitle={t('No blocks found')}
        emptyStateTextDescription={t(
          'Add a block to your project that you want to use in your automations',
        )}
        emptyStateIcon={<Package className="size-14" />}
        columns={columns}
        customFilters={customFilters}
        page={{
          data: blocks ?? [],
          next: null,
          previous: null,
        }}
        isLoading={isLoading}
        hidePagination={true}
        toolbarButtons={platform.plan.manageBlocksEnabled ? toolbarButtons : []}
      />
    </div>
  );
};

BlocksSettings.displayName = 'BlocksSettings';
export { BlocksSettings };
