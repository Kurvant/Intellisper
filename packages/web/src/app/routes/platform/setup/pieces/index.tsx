import {
  BlockMetadataModelSummary,
  PropertyType,
} from '@intelblocks/blocks-framework';
import { isNil, OAuth2GrantType, BlockScope } from '@intelblocks/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { CheckIcon, Package, Hash, GitBranch, Puzzle } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import { RequestTrial } from '@/app/components/request-trial';
import { ApplyTags } from '@/app/routes/platform/setup/pieces/apply-tags';
import { BlockActions } from '@/app/routes/platform/setup/pieces/piece-actions';
import { SyncBlocksButton } from '@/app/routes/platform/setup/pieces/sync-pieces';
import { ConfigureBlockOAuth2Dialog } from '@/app/routes/platform/setup/pieces/update-oauth2-dialog';
import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { LockedAlert } from '@/components/custom/locked-alert';
import { Badge } from '@/components/ui/badge';
import { oauthAppsQueries } from '@/features/connections';
import { InstallBlockDialog, BlockIcon, blocksHooks } from '@/features/pieces';
import { platformHooks } from '@/hooks/platform-hooks';

const PlatformBlocksPage = () => {
  const { platform } = platformHooks.useCurrentPlatform();
  const isEnabled = platform.plan.manageBlocksEnabled;
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('name') ?? '';
  const {
    blocks,
    refetch: refetchBlocks,
    isLoading,
  } = blocksHooks.useBlocks({
    searchQuery,
    includeTags: true,
    includeHidden: true,
    isTableQuery: true,
  });

  const { refetch: refetchBlocksOAuth2AppsMap } =
    oauthAppsQueries.useBlocksOAuth2AppsMap();

  const columns: ColumnDef<RowDataWithActions<BlockMetadataModelSummary>>[] =
    useMemo(
      () => [
        {
          accessorKey: 'displayName',
          size: 300,
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title={t('Name')}
              icon={Puzzle}
            />
          ),
          cell: ({ row }) => {
            return (
              <div className="flex items-center gap-2">
                <BlockIcon
                  size={'sm'}
                  border={true}
                  displayName={row.original.displayName}
                  logoUrl={row.original.logoUrl}
                  showTooltip={false}
                />
                <div className="flex flex-col gap-0.5">
                  <span>{row.original.displayName}</span>
                  {row.original.tags && row.original.tags.length > 0 && (
                    <div className="flex gap-1">
                      {row.original.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-xs py-0 px-1.5"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          },
        },
        {
          accessorKey: 'packageName',
          size: 250,
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
          size: 80,
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
          id: 'actions',
          size: 80,
          cell: ({ row }) => {
            return (
              <div className="flex justify-end">
                {shouldShowOauth2SettingForBlock(row.original) && (
                  <ConfigureBlockOAuth2Dialog
                    blockName={row.original.name}
                    onConfigurationDone={() => {
                      refetchBlocks();
                      refetchBlocksOAuth2AppsMap();
                    }}
                    isEnabled={isEnabled}
                  />
                )}
                <BlockActions
                  blockName={row.original.name}
                  isEnabled={isEnabled}
                />
              </div>
            );
          },
        },
      ],
      [],
    );

  return (
    <>
      <DashboardPageHeader
        description={t('Manage the blocks that are available to your users')}
        title={t('Blocks')}
      />
      <div className="mx-auto w-full flex flex-col flex-1 min-h-0">
        {!isEnabled && (
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
            'Start by installing blocks that you want to use in your automations',
          )}
          emptyStateIcon={<Package className="size-14" />}
          columns={columns}
          filters={[
            {
              type: 'input',
              title: t('Block Name'),
              accessorKey: 'name',
              icon: CheckIcon,
            },
          ]}
          page={{
            data: blocks ?? [],
            next: null,
            previous: null,
          }}
          isLoading={isLoading}
          bulkActions={[
            {
              render: (selectedRows) => (
                <ApplyTags
                  selectedBlocks={selectedRows}
                  onApplyTags={() => refetchBlocks()}
                />
              ),
            },
          ]}
          toolbarButtons={[
            <SyncBlocksButton key="sync" />,
            <InstallBlockDialog
              key="install"
              onInstallBlock={() => refetchBlocks()}
              scope={BlockScope.PLATFORM}
            />,
          ]}
          selectColumn={true}
          virtualizeRows={true}
          hidePagination={true}
        />
      </div>
    </>
  );
};

PlatformBlocksPage.displayName = 'PlatformPiecesPage';
export { PlatformBlocksPage };

function shouldShowOauth2SettingForBlock(block: BlockMetadataModelSummary) {
  const blockAuth = Array.isArray(block.auth)
    ? block.auth.find((auth) => auth.type === PropertyType.OAUTH2)
    : block.auth;
  if (isNil(blockAuth)) {
    return false;
  }
  if (blockAuth.type !== PropertyType.OAUTH2) {
    return false;
  }
  if (blockAuth.grantType === OAuth2GrantType.CLIENT_CREDENTIALS) {
    return false;
  }
  return true;
}
