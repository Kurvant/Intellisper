import { VariableWithoutSensitiveData } from '@intelblocks/shared';
import { t } from 'i18next';
import { Link2, MoreVertical, Pencil, Trash2, Variable } from 'lucide-react';

import { IbAvatar } from '@/components/custom/ap-avatar';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * A single variable rendered as a premium card (the gallery presentation). Same capabilities as the
 * table row — select, Edit, Copy reference, Delete (all permission-gated), owner + last-updated —
 * just a different layout/feel.
 */
export function OvVariableCard({
  variable,
  isSelected,
  onToggleSelect,
  onEdit,
  onCopyReference,
  onDelete,
  canWrite,
  showOwner,
}: {
  variable: VariableWithoutSensitiveData;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCopyReference: () => void;
  onDelete: () => void;
  canWrite: boolean;
  showOwner: boolean;
}) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-md',
        isSelected
          ? 'border-[#3B6EF5] ring-1 ring-[#3B6EF5]/40'
          : 'border-border/70',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={t('Select variable')}
          />
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Variable className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-sm font-medium"
            title={variable.name}
          >
            {variable.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('Updated')} <FormattedDate date={new Date(variable.updated)} />
          </p>
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Open menu')}
              className="shrink-0 text-muted-foreground"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled={!canWrite} onSelect={onEdit}>
              <Pencil className="mr-2 size-4" />
              {t('Edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyReference}>
              <Link2 className="mr-2 size-4" />
              {t('Copy reference')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canWrite}
              className="text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 className="mr-2 size-4" />
              {t('Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <button
          type="button"
          className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onCopyReference}
          title={t('Copy reference')}
        >
          <code className="rounded bg-muted px-1.5 py-0.5">{`{{variables['${variable.name}']}}`}</code>
        </button>
        {showOwner && (
          <div className="flex shrink-0 items-center gap-1.5">
            {variable.ownerId ? (
              <IbAvatar
                id={variable.ownerId}
                includeAvatar={true}
                includeName={true}
                size="small"
              />
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
