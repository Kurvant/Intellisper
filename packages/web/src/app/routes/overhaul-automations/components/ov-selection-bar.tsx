import { t } from 'i18next';
import { Download, FolderInput, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { LoadingSpinner } from '@/components/custom/spinner';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';

/**
 * Overhaul bulk-selection bar (all-new UI). Same contract as AutomationsSelectionBar — BLD-195..198:
 * bulk move (hidden if hideFolders; disabled if none movable), bulk export (hidden if
 * hideExportAndImportFlow; disabled if none exportable / while exporting), bulk delete (confirm),
 * clear selection. Rendered only when selectedCount > 0.
 */
export function OvSelectionBar({
  selectedCount,
  isDeleting,
  isMoving,
  isExporting,
  hasMovableOrExportableItems,
  onMoveClick,
  onDeleteClick,
  onExportClick,
  onClearSelection,
}: {
  selectedCount: number;
  isDeleting: boolean;
  isMoving: boolean;
  isExporting: boolean;
  hasMovableOrExportableItems: boolean;
  onMoveClick: () => void;
  onDeleteClick: () => void;
  onExportClick: () => void;
  onClearSelection: () => void;
}) {
  const { embedState } = useEmbedding();
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-[0_8px_40px_-12px_rgba(16,22,35,.35)] backdrop-blur-xl"
        >
          <span className="px-2.5 text-xs font-semibold tabular-nums text-foreground">
            {t('{count} selected', { count: selectedCount })}
          </span>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          {!embedState.hideFolders && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={onMoveClick}
              disabled={isMoving || !hasMovableOrExportableItems}
            >
              <FolderInput className="h-4 w-4" />
              {t('Move to')}
            </Button>
          )}
          {!embedState.hideExportAndImportFlow && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={onExportClick}
              disabled={isExporting || !hasMovableOrExportableItems}
            >
              {isExporting ? (
                <LoadingSpinner className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isExporting ? t('Exporting') : t('Export')}
            </Button>
          )}
          <ConfirmationDeleteDialog
            title={t('Delete Selected Items')}
            message={t(
              'This will permanently delete {count} selected items. This action cannot be undone.',
              { count: selectedCount },
            )}
            mutationFn={async () => onDeleteClick()}
            entityName={t('items')}
            buttonText={t('Delete')}
          >
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-lg text-destructive hover:text-destructive"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
              {t('Delete')}
            </Button>
          </ConfirmationDeleteDialog>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg"
            onClick={onClearSelection}
            aria-label={t('Clear selection')}
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
