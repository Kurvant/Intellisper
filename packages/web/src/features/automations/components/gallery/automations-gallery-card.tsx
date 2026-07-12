import { FolderDto, PopulatedFlow, Table } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  Copy,
  CornerUpLeft,
  Download,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { IbAvatar } from '@/components/custom/ap-avatar';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Icon3d } from '@/components/icons-3d';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoveToFolderDialog } from '@/features/automations/components/move-to-folder-dialog';
import { FlowStatusToggle } from '@/features/flows/components/flow-status-toggle';
import { ShareTemplateDialog } from '@/features/flows/components/share-template-dialog';
import { BlockIconList } from '@/features/pieces/components/piece-icon-list';
import { cn } from '@/lib/utils';

import { TreeItem } from '../../lib/types';

/**
 * Automation gallery card — the premium default view's atom. Renders a single flow/table with the
 * SAME action vocabulary as the table row (BLD-149..158): pin/favorite, select, open (row click),
 * status toggle, rename, duplicate, move-to, export, share, delete — with the same embed gates.
 * It reuses the exact building-block components (FlowStatusToggle, dialogs, BlockIconList, IbAvatar)
 * so behavior is identical, not re-implemented. Folders are handled by the gallery container as
 * section headers, so this card only renders flow/table items.
 */
export function AutomationsGalleryCard({
  item,
  isSelected,
  isPinned,
  folders,
  onRowClick,
  onToggleSelection,
  onTogglePin,
  onRename,
  onDelete,
  onDuplicate,
  onMoveTo,
  onExportFlow,
  onExportTable,
  isDuplicating,
}: {
  item: TreeItem;
  isSelected: boolean;
  isPinned: boolean;
  folders: FolderDto[];
  onRowClick: (ctrlKey?: boolean) => void;
  onToggleSelection: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: (flow: PopulatedFlow) => void;
  onMoveTo: (item: TreeItem, folderId: string) => void;
  onExportFlow: (flow: PopulatedFlow) => void;
  onExportTable: (table: Table) => void;
  isDuplicating: boolean;
}) {
  const { embedState } = useEmbedding();
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState('');
  const flow = isFlowItem(item) ? item.data : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => onRowClick(e.ctrlKey || e.metaKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onRowClick();
        }}
        className={cn(
          'group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(16,22,35,.04),0_10px_24px_-18px_rgba(16,22,35,.22)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_1px_2px_rgba(16,22,35,.05),0_18px_36px_-20px_rgba(154,82,32,.4)]',
          isSelected
            ? 'border-primary/60 ring-1 ring-primary/30'
            : 'border-border/70',
        )}
      >
        {/* Top row: 3D icon + select checkbox + pin + menu */}
        <div className="flex items-start gap-3">
          <Icon3d
            name={item.type === 'table' ? 'table' : 'automation'}
            size={38}
          />
          <div className="ml-auto flex items-center gap-0.5">
            <span
              className="opacity-0 transition-opacity group-hover:opacity-100 data-[on=true]:opacity-100"
              data-on={isSelected}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggleSelection}
                aria-label={t('Select')}
              />
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin();
                  }}
                  className="rounded p-1 transition-colors hover:bg-muted"
                  aria-label={
                    isPinned
                      ? t('Remove from favorites')
                      : t('Add to favorites')
                  }
                >
                  <Star
                    className={cn(
                      'h-4 w-4',
                      isPinned
                        ? 'fill-yellow-500 text-yellow-500'
                        : 'text-muted-foreground/40 hover:text-muted-foreground',
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isPinned ? t('Remove from favorites') : t('Add to favorites')}
              </TooltipContent>
            </Tooltip>
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('More options')}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('Rename')}
                  </DropdownMenuItem>

                  {isFlowItem(item) && !embedState.hideDuplicateFlow && (
                    <DropdownMenuItem
                      onClick={() => onDuplicate(item.data)}
                      disabled={isDuplicating}
                    >
                      {isDuplicating ? (
                        <LoadingSpinner className="mr-2" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {isDuplicating ? t('Duplicating...') : t('Duplicate')}
                    </DropdownMenuItem>
                  )}

                  {!embedState.hideFolders && (
                    <DropdownMenuItem
                      onClick={() => {
                        setMoveFolderId('');
                        setIsMoveOpen(true);
                      }}
                    >
                      <CornerUpLeft className="mr-2 h-4 w-4" />
                      {t('Move To')}
                    </DropdownMenuItem>
                  )}

                  {isFlowItem(item) && !embedState.hideExportAndImportFlow && (
                    <DropdownMenuItem onClick={() => onExportFlow(item.data)}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('Export')}
                    </DropdownMenuItem>
                  )}

                  {isTableItem(item) && (
                    <DropdownMenuItem onClick={() => onExportTable(item.data)}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('Export')}
                    </DropdownMenuItem>
                  )}

                  {isFlowItem(item) && !embedState.isEmbedded && (
                    <ShareTemplateDialog
                      flowId={item.id}
                      flowVersionId={item.data.version.id}
                    >
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Share2 className="mr-2 h-4 w-4" />
                        {t('Share')}
                      </DropdownMenuItem>
                    </ShareTemplateDialog>
                  )}

                  <DropdownMenuSeparator />
                  <ConfirmationDeleteDialog
                    title={t('Delete {type}', { type: item.type })}
                    message={t('Deleting "{name}" cannot be undone.', {
                      name: item.name,
                    })}
                    mutationFn={async () => onDelete()}
                    entityName={item.type}
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
          </div>
        </div>

        {/* Name + meta */}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{item.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {item.data && <FormattedDate date={new Date(item.data.updated)} />}
            {isFlowItem(item) && item.data.ownerId && (
              <>
                <span>·</span>
                <IbAvatar
                  id={item.data.ownerId}
                  includeAvatar
                  includeName
                  size="small"
                />
              </>
            )}
          </div>
        </div>

        {/* Footer: blocks used + status toggle */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {isFlowItem(item) ? (
            <BlockIconList
              trigger={item.data.version.trigger}
              maxNumberOfIconsToShow={4}
              size="xs"
            />
          ) : (
            <span className="text-[11.5px] text-muted-foreground">
              {t('Table')}
            </span>
          )}
          {flow && (
            <span onClick={(e) => e.stopPropagation()}>
              <FlowStatusToggle flow={flow} />
            </span>
          )}
        </div>
      </div>

      <MoveToFolderDialog
        open={isMoveOpen}
        onOpenChange={setIsMoveOpen}
        folders={folders}
        selectedFolderId={moveFolderId}
        onFolderChange={setMoveFolderId}
        onConfirm={() => {
          onMoveTo(item, moveFolderId);
          setIsMoveOpen(false);
        }}
      />
    </>
  );
}

function isFlowItem(
  item: TreeItem,
): item is Omit<TreeItem, 'data'> & { data: PopulatedFlow } {
  return item.type === 'flow';
}

function isTableItem(
  item: TreeItem,
): item is Omit<TreeItem, 'data'> & { data: Table } {
  return item.type === 'table';
}
