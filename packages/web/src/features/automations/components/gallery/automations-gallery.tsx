import { FolderDto, PopulatedFlow, Table } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Link,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Icon3d } from '@/components/icons-3d';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { SelectedItemsMap, TreeItem } from '../../lib/types';
import { groupTreeItemsByFolder } from '../../lib/utils';
import { CreateInFolderKind, CreateNewMenu } from '../create-new-menu';

import { AutomationsGalleryCard } from './automations-gallery-card';

/**
 * Gallery view of the automations tree (premium default). Same prop contract as AutomationsTable so
 * it is a drop-in alternative — every capability flows through the same handlers, and it reuses the
 * canonical groupTreeItemsByFolder() grouping. Folders render as collapsible section headers
 * (expand/collapse + create-in-folder); flow/table items render as cards in a responsive grid.
 * Cards reuse the real action components, so nothing is re-implemented.
 */
export function AutomationsGallery(props: AutomationsGalleryProps) {
  const {
    items,
    isLoading,
    selectedItems,
    expandedFolders,
    folders,
    selectableCount,
    isPinned,
    onTogglePin,
    onToggleAllSelection,
    onToggleItemSelection,
    onRowClick,
    onRenameItem,
    onDeleteItem,
    onDuplicateFlow,
    onMoveItem,
    onExportFlow,
    onExportTable,
    onCreateInFolder,
    userHasPermissionToWriteFlow,
    userHasPermissionToWriteTable,
    isCreatingFlow,
    isCreatingTable,
    isDuplicating,
    isMoving,
    onLoadMoreInFolder,
    isItemSelected,
  } = props;

  if (isLoading) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const rows = groupTreeItemsByFolder(items);
  const allSelected =
    selectableCount > 0 && selectedItems.size === selectableCount;

  const renderCard = (item: TreeItem) => (
    <AutomationsGalleryCard
      key={item.id}
      item={item}
      isSelected={isItemSelected(item)}
      isPinned={isPinned(item.id)}
      folders={folders}
      onRowClick={(ctrlKey) => onRowClick(item, ctrlKey)}
      onToggleSelection={() => onToggleItemSelection(item)}
      onTogglePin={() => onTogglePin(item.id)}
      onRename={() => onRenameItem(item)}
      onDelete={() => onDeleteItem(item)}
      onDuplicate={onDuplicateFlow}
      onMoveTo={onMoveItem}
      onExportFlow={onExportFlow}
      onExportTable={onExportTable}
      isDuplicating={isDuplicating}
      isMoving={isMoving}
    />
  );

  return (
    <div className="mt-4 flex flex-col gap-6">
      {selectableCount > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleAllSelection}
          />
          {allSelected ? t('Deselect all') : t('Select all')}
        </label>
      )}

      {(() => {
        // Ungrouped (root, non-folder) cards render first as a single grid.
        const rootCards = rows
          .filter((r) => r.item.type === 'flow' || r.item.type === 'table')
          .map((r) => r.item);
        return rootCards.length > 0 ? (
          <CardGrid>{rootCards.map(renderCard)}</CardGrid>
        ) : null;
      })()}

      {rows
        .filter((r) => r.item.type === 'folder')
        .map((row) => {
          const folder = row.item;
          const isExpanded = expandedFolders.has(folder.id);
          const cards = row.children.filter(
            (c) => c.type === 'flow' || c.type === 'table',
          );
          const loadMore = row.children.find(
            (c) => c.type === 'load-more-folder',
          );
          return (
            <section key={folder.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRowClick(folder)}
                  className="flex items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Icon3d name="folder" size={22} />
                  <span className="text-sm font-bold">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {folder.childCount}{' '}
                    {folder.childCount === 1 ? t('file') : t('files')}
                  </span>
                </button>
                {onCreateInFolder && (
                  <Tooltip>
                    <CreateNewMenu
                      scope="folder"
                      align="end"
                      userHasPermissionToWriteFlow={
                        !!userHasPermissionToWriteFlow
                      }
                      userHasPermissionToWriteTable={
                        !!userHasPermissionToWriteTable
                      }
                      userHasPermissionToWriteFolder={false}
                      isCreatingFlow={isCreatingFlow}
                      isCreatingTable={isCreatingTable}
                      onCreateFlow={() => onCreateInFolder(folder.id, 'flow')}
                      onCreateTable={() => onCreateInFolder(folder.id, 'table')}
                      onImportFlow={() =>
                        onCreateInFolder(folder.id, 'import-flow')
                      }
                      onImportTable={() =>
                        onCreateInFolder(folder.id, 'import-table')
                      }
                    >
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t('Create inside folder')}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                    </CreateNewMenu>
                    <TooltipContent side="top">
                      {t('Create inside folder')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Folder actions — preserves BLD-151 (Copy URL) + rename/delete for folders */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('Folder options')}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('folder', folder.id);
                        navigator.clipboard.writeText(url.toString());
                        toast.success(t('URL copied to clipboard'));
                      }}
                    >
                      <Link className="mr-2 h-4 w-4" />
                      {t('Copy URL')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRenameItem(folder)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('Rename')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ConfirmationDeleteDialog
                      title={t('Delete {type}', { type: folder.type })}
                      message={t('Deleting "{name}" cannot be undone.', {
                        name: folder.name,
                      })}
                      mutationFn={async () => onDeleteItem(folder)}
                      entityName={folder.type}
                      buttonText={t('Delete')}
                    >
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('Delete')}
                      </DropdownMenuItem>
                    </ConfirmationDeleteDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isExpanded && (
                <div className="border-l-2 border-border/60 pl-4">
                  {cards.length > 0 ? (
                    <CardGrid>{cards.map(renderCard)}</CardGrid>
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">
                      {t('This folder is empty.')}
                    </p>
                  )}
                  {loadMore && (
                    <button
                      type="button"
                      onClick={() => onLoadMoreInFolder?.(folder.id)}
                      className="mt-3 flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <ArrowDown className="h-4 w-4" />
                      {t('Load {count} more items...', {
                        count: loadMore.loadMoreCount,
                      })}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

type AutomationsGalleryProps = {
  items: TreeItem[];
  isLoading: boolean;
  selectedItems: SelectedItemsMap;
  expandedFolders: Set<string>;
  folders: FolderDto[];
  selectableCount: number;
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  onToggleAllSelection: () => void;
  onToggleItemSelection: (item: TreeItem) => void;
  onRowClick: (item: TreeItem, ctrlKey?: boolean) => void;
  onRenameItem: (item: TreeItem) => void;
  onDeleteItem: (item: TreeItem) => void;
  onDuplicateFlow: (flow: PopulatedFlow) => void;
  onMoveItem: (item: TreeItem, folderId: string) => void;
  onExportFlow: (flow: PopulatedFlow) => void;
  onExportTable: (table: Table) => void;
  onCreateInFolder?: (folderId: string, kind: CreateInFolderKind) => void;
  userHasPermissionToWriteFlow?: boolean;
  userHasPermissionToWriteTable?: boolean;
  isCreatingFlow?: boolean;
  isCreatingTable?: boolean;
  isDuplicating: boolean;
  isMoving: boolean;
  onLoadMoreInFolder?: (folderId: string) => void;
  isItemSelected: (item: TreeItem) => boolean;
};
