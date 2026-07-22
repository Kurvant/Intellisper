import { Permission, UncategorizedFolderId } from '@intelblocks/shared';
import { t } from 'i18next';
import { LayoutGrid, List } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { recordAccess } from '@/app/components/global-search/access-history';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { AutomationsEmptyState } from '@/features/automations/components/automations-empty-state';
import { AutomationsTable } from '@/features/automations/components/automations-table';
import { CreateFolderDialog } from '@/features/automations/components/create-folder-dialog';
import { CreateInFolderKind } from '@/features/automations/components/create-new-menu';
import { AutomationsGallery } from '@/features/automations/components/gallery/automations-gallery';
import { MoveToFolderDialog } from '@/features/automations/components/move-to-folder-dialog';
import { RenameDialog } from '@/features/automations/components/rename-dialog';
import { useAutomationsData } from '@/features/automations/hooks/use-automations-data';
import { useAutomationsDialogs } from '@/features/automations/hooks/use-automations-dialogs';
import { useAutomationsFilters } from '@/features/automations/hooks/use-automations-filters';
import { useAutomationsMutations } from '@/features/automations/hooks/use-automations-mutations';
import {
  hasMovableOrExportableItems,
  useAutomationsSelection,
} from '@/features/automations/hooks/use-automations-selection';
import { usePinnedItems } from '@/features/automations/hooks/use-pinned-items';
import { TreeItem } from '@/features/automations/lib/types';
import { appConnectionsQueries } from '@/features/connections';
import { ImportFlowDialog } from '@/features/flows/components/import-flow-dialog';
import { projectMembersHooks } from '@/features/members';
import { blocksHooks } from '@/features/pieces';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import { ImportTableDialog } from '@/features/tables/components/import-table-dialog';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import { RoutePermissionGuard } from '../../guards/permission-guard';

import { OvNoResults } from './components/ov-no-results';
import { OvPagination } from './components/ov-pagination';
import { OvSelectionBar } from './components/ov-selection-bar';
import { OvToolbar } from './components/ov-toolbar';

const AUTOMATIONS_VIEW_STORAGE_KEY = 'ib.automations.viewMode';

const permissions = [
  Permission.READ_FLOW,
  Permission.READ_TABLE,
  Permission.READ_FOLDER,
];

/**
 * Automations — true interior rewrite in the new shell (all-new presentation, reuses only the
 * data/mutation/dialog hooks). Every BLD-145..204 list capability is present via the new toolbar,
 * gallery/table, pagination, selection bar and dialogs. Old AutomationsPage stays untouched; both
 * routes are live per the route-replacement map.
 */
export function OverhaulAutomationsPage() {
  const { projectId: projectIdFromUrl } = useParams<{ projectId: string }>();
  const projectId = projectIdFromUrl ?? authenticationSession.getProjectId()!;
  return (
    <NewAppShell
      title={t('Automations')}
      subtitle={t('Build and organize your flows, tables and folders')}
    >
      <RoutePermissionGuard requiredPermissions={permissions}>
        <div className="mx-auto max-w-[1280px] px-7 py-6">
          <AutomationsContent key={projectId} projectId={projectId} />
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

function AutomationsContent({ projectId }: { projectId: string }) {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { embedState } = useEmbedding();

  const [viewMode, setViewModeState] = useState<'gallery' | 'table'>(() =>
    localStorage.getItem(AUTOMATIONS_VIEW_STORAGE_KEY) === 'table'
      ? 'table'
      : 'gallery',
  );
  const setViewMode = (mode: 'gallery' | 'table') => {
    localStorage.setItem(AUTOMATIONS_VIEW_STORAGE_KEY, mode);
    setViewModeState(mode);
  };

  const { data: allProjects = [] } = projectCollectionUtils.useAll();
  const currentProjectName = (() => {
    const p = allProjects.find((proj) => proj.id === projectId);
    return p ? getProjectName(p) : null;
  })();

  const { checkAccess } = useAuthorization();
  const userHasPermissionToWriteFlow = checkAccess(Permission.WRITE_FLOW);
  const userHasPermissionToWriteTable = checkAccess(Permission.WRITE_TABLE);
  const userHasPermissionToWriteFolder = checkAccess(Permission.WRITE_FOLDER);

  const {
    searchInput,
    handleSearchChange,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    connectionFilter,
    setConnectionFilter,
    ownerFilter,
    setOwnerFilter,
    folderFilter,
    setFolderFilter,
    filters,
    filtersActive,
    clearAllFilters,
  } = useAutomationsFilters();

  const { pinnedList, isPinned, togglePin, unpinItem } = usePinnedItems();

  const {
    treeItems,
    folders,
    rootFlows,
    rootTables,
    isLoading,
    expandedFolders,
    toggleFolder,
    loadMoreInFolder,
    rootPage,
    pageSize,
    changePageSize,
    totalPages,
    nextRootPage,
    prevRootPage,
    resetPagination,
    invalidateAll,
    invalidateRoot,
    invalidateFolder,
  } = useAutomationsData(filters, pinnedList);

  const expandFolderIfCollapsed = useCallback(
    (folderId: string) => {
      if (!expandedFolders.has(folderId)) toggleFolder(folderId);
    },
    [expandedFolders, toggleFolder],
  );

  const {
    selectedItems,
    toggleItemSelection,
    toggleAllSelection,
    clearSelection,
    isItemSelected,
    selectableItems,
  } = useAutomationsSelection(treeItems);

  const mutations = useAutomationsMutations({
    invalidateAll,
    invalidateRoot,
    invalidateFolder,
    clearSelection,
    treeItems,
    unpinItem,
    // Overhaul: newly-created tables open in the new /data/tables editor, not the legacy shell.
    variant: 'overhaul',
  });

  const dialogs = useAutomationsDialogs({ mutations, selectedItems });

  const { data: connections } = appConnectionsQueries.useAppConnections({
    request: { projectId, limit: 10000 },
    extraKeys: [projectId],
  });
  const { projectMembers } = projectMembersHooks.useProjectMembers();
  const { blocks } = blocksHooks.useBlocks({});

  const handleFiltersChange = useCallback(() => {
    clearSelection();
    resetPagination();
  }, [clearSelection, resetPagination]);
  const handleNextPage = useCallback(() => {
    clearSelection();
    nextRootPage();
  }, [clearSelection, nextRootPage]);
  const handlePrevPage = useCallback(() => {
    clearSelection();
    prevRootPage();
  }, [clearSelection, prevRootPage]);
  const handlePageSizeChange = useCallback(
    (size: number) => {
      clearSelection();
      changePageSize(size);
    },
    [clearSelection, changePageSize],
  );

  const handleRowClick = useCallback(
    (item: TreeItem, ctrlKey?: boolean) => {
      if (item.type === 'folder') {
        if (expandedFolders.has(item.id)) clearSelection();
        toggleFolder(item.id);
      } else if (item.type === 'flow' || item.type === 'table') {
        const href = authenticationSession.appendProjectRoutePrefix(
          item.type === 'flow'
            ? `/flows/${item.id}`
            : `/data/tables/${item.id}`,
        );
        const folderName = item.folderId
          ? folders.find((f) => f.id === item.folderId)?.displayName ?? null
          : null;
        const flowStatus =
          item.type === 'flow'
            ? (item.data as { status?: 'ENABLED' | 'DISABLED' } | null)
                ?.status ?? null
            : null;
        recordAccess({
          id: `${item.type}-${item.id}`,
          type: item.type,
          label: item.name,
          href,
          status: flowStatus,
          folderName,
          projectName: currentProjectName,
        });
        if (ctrlKey) window.open(href, '_blank');
        else navigate(href);
      }
    },
    [
      navigate,
      toggleFolder,
      folders,
      currentProjectName,
      clearSelection,
      expandedFolders,
    ],
  );

  const handleCreateInFolder = useCallback(
    (folderId: string, kind: CreateInFolderKind) => {
      switch (kind) {
        case 'flow':
          mutations.createFlow(folderId);
          break;
        case 'table':
          mutations.createTable(t('New Table'), folderId);
          break;
        case 'import-flow':
          expandFolderIfCollapsed(folderId);
          dialogs.setImportTargetFolderId(folderId);
          dialogs.setIsImportFlowDialogOpen(true);
          break;
        case 'import-table':
          expandFolderIfCollapsed(folderId);
          dialogs.setImportTargetFolderId(folderId);
          dialogs.setIsImportTableDialogOpen(true);
          break;
      }
    },
    [expandFolderIfCollapsed, mutations, dialogs],
  );

  const updateSearchParams = (newFolderId: string | undefined) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (newFolderId) p.set('folderId', newFolderId);
        else p.delete('folderId');
        return p;
      },
      { replace: true },
    );
  };

  const hasAnyItems =
    rootFlows.length > 0 || rootTables.length > 0 || folders.length > 0;
  const isEmptyState = !hasAnyItems && !isLoading && !filtersActive;
  const isNoResultsState =
    treeItems.length === 0 && filtersActive && !isLoading;

  if (isEmptyState) {
    return (
      <AutomationsEmptyState
        onRefresh={() => invalidateAll()}
        variant="overhaul"
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <OvToolbar
        searchTerm={searchInput}
        onSearchChange={handleSearchChange}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        connectionFilter={connectionFilter}
        onConnectionFilterChange={setConnectionFilter}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        folderFilter={folderFilter}
        onFolderFilterChange={setFolderFilter}
        onFilterChange={handleFiltersChange}
        folders={folders}
        connections={connections?.data}
        blocks={blocks}
        userHasPermissionToWriteFlow={userHasPermissionToWriteFlow}
        userHasPermissionToWriteTable={userHasPermissionToWriteTable}
        userHasPermissionToWriteFolder={userHasPermissionToWriteFolder}
        onCreateFlow={() => mutations.createFlow()}
        onCreateTable={() => mutations.createTable(t('New Table'))}
        onCreateFolder={() => dialogs.setIsFolderDialogOpen(true)}
        onImportFlow={() => {
          dialogs.setImportTargetFolderId(undefined);
          dialogs.setIsImportFlowDialogOpen(true);
        }}
        onImportTable={() => {
          dialogs.setImportTargetFolderId(undefined);
          dialogs.setIsImportTableDialogOpen(true);
        }}
        onClearAllFilters={clearAllFilters}
        hasActiveFilters={filtersActive}
        isCreatingFlow={mutations.isCreateFlowPending}
        isCreatingTable={mutations.isCreatingTable}
        onSelectTemplate={() => navigate('/build/explore')}
      />

      {isNoResultsState ? (
        <OvNoResults onClearFilters={clearAllFilters} />
      ) : (
        <>
          <div className="flex items-center justify-end">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>

          {viewMode === 'gallery' ? (
            <AutomationsGallery
              items={treeItems}
              isLoading={isLoading}
              selectedItems={selectedItems}
              expandedFolders={expandedFolders}
              folders={folders}
              selectableCount={selectableItems.length}
              isPinned={isPinned}
              onTogglePin={togglePin}
              onToggleAllSelection={toggleAllSelection}
              onToggleItemSelection={toggleItemSelection}
              onRowClick={handleRowClick}
              onRenameItem={dialogs.openRenameDialog}
              onDeleteItem={mutations.handleDeleteItem}
              onDuplicateFlow={mutations.handleDuplicateFlow}
              onMoveItem={mutations.handleMoveItem}
              onExportFlow={mutations.handleExportFlow}
              onExportTable={mutations.handleExportTable}
              onCreateInFolder={handleCreateInFolder}
              userHasPermissionToWriteFlow={userHasPermissionToWriteFlow}
              userHasPermissionToWriteTable={userHasPermissionToWriteTable}
              isCreatingFlow={mutations.isCreateFlowPending}
              isCreatingTable={mutations.isCreatingTable}
              isDuplicating={mutations.isDuplicating}
              isMoving={mutations.isMoving}
              onLoadMoreInFolder={loadMoreInFolder}
              isItemSelected={isItemSelected}
            />
          ) : (
            <AutomationsTable
              items={treeItems}
              isLoading={isLoading}
              selectedItems={selectedItems}
              expandedFolders={expandedFolders}
              projectMembers={projectMembers}
              folders={folders}
              selectableCount={selectableItems.length}
              isPinned={isPinned}
              onTogglePin={togglePin}
              onToggleAllSelection={toggleAllSelection}
              onToggleItemSelection={toggleItemSelection}
              onRowClick={handleRowClick}
              onRenameItem={dialogs.openRenameDialog}
              onDeleteItem={mutations.handleDeleteItem}
              onDuplicateFlow={mutations.handleDuplicateFlow}
              onMoveItem={mutations.handleMoveItem}
              onExportFlow={mutations.handleExportFlow}
              onExportTable={mutations.handleExportTable}
              onCreateInFolder={handleCreateInFolder}
              userHasPermissionToWriteFlow={userHasPermissionToWriteFlow}
              userHasPermissionToWriteTable={userHasPermissionToWriteTable}
              isCreatingFlow={mutations.isCreateFlowPending}
              isCreatingTable={mutations.isCreatingTable}
              isMoving={mutations.isMoving}
              isDuplicating={mutations.isDuplicating}
              onLoadMoreInFolder={loadMoreInFolder}
              isItemSelected={isItemSelected}
            />
          )}

          <OvPagination
            currentPage={rootPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </>
      )}

      <OvSelectionBar
        selectedCount={selectedItems.size}
        isDeleting={mutations.isDeleting}
        isMoving={mutations.isMoving}
        isExporting={mutations.isExporting}
        hasMovableOrExportableItems={hasMovableOrExportableItems(selectedItems)}
        onMoveClick={() => dialogs.setMoveToDialogOpen(true)}
        onDeleteClick={() => mutations.handleBulkDelete(selectedItems)}
        onExportClick={() => mutations.handleBulkExport(selectedItems)}
        onClearSelection={clearSelection}
      />

      <MoveToFolderDialog
        open={dialogs.moveToDialogOpen}
        onOpenChange={dialogs.setMoveToDialogOpen}
        folders={folders}
        selectedFolderId={dialogs.moveToFolderId}
        onFolderChange={dialogs.setMoveToFolderId}
        onConfirm={dialogs.handleBulkMoveTo}
        isMoving={mutations.isMoving}
      />
      <RenameDialog
        open={dialogs.renameDialogOpen}
        onOpenChange={dialogs.setRenameDialogOpen}
        value={dialogs.newName}
        onChange={dialogs.setNewName}
        onConfirm={dialogs.handleRename}
        isRenaming={mutations.isRenaming}
      />
      <CreateFolderDialog
        updateSearchParams={updateSearchParams}
        open={dialogs.isFolderDialogOpen}
        refetchFolders={() => invalidateAll()}
        onOpenChange={dialogs.setIsFolderDialogOpen}
      />
      <ImportFlowDialog
        key={dialogs.importTargetFolderId ?? 'root-import-flow'}
        insideBuilder={false}
        folderId={dialogs.importTargetFolderId ?? UncategorizedFolderId}
        onRefresh={() => invalidateAll()}
      >
        <button
          className="hidden"
          ref={(el) => {
            if (el && dialogs.isImportFlowDialogOpen) {
              el.click();
              dialogs.setIsImportFlowDialogOpen(false);
            }
          }}
        />
      </ImportFlowDialog>
      {!embedState.hideTables && (
        <ImportTableDialog
          open={dialogs.isImportTableDialogOpen}
          setIsOpen={(open) => {
            dialogs.setIsImportTableDialogOpen(open);
            if (!open) dialogs.setImportTargetFolderId(undefined);
          }}
          showTrigger={false}
          folderId={dialogs.importTargetFolderId}
          onImportSuccess={() => invalidateAll()}
          variant="overhaul"
        />
      )}
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: 'gallery' | 'table';
  onChange: (mode: 'gallery' | 'table') => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Gallery view')}
        aria-pressed={value === 'gallery'}
        onClick={() => onChange('gallery')}
        className={cn(
          'rounded-md',
          value === 'gallery'
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-muted-foreground',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Table view')}
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
        className={cn(
          'rounded-md',
          value === 'table'
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-muted-foreground',
        )}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default OverhaulAutomationsPage;
