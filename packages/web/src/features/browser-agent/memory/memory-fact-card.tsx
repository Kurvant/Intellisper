import { MemoryFactView, MemoryVisibility } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  Check,
  Lock,
  MoreHorizontal,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
  User2,
  X,
} from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

/** Kind → tint. Purely visual grouping so a long list is scannable at a glance. */
const KIND_STYLES: Record<string, string> = {
  PREFERENCE:
    'bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20',
  PROJECT: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20',
  TASK: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
  CONTACT:
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
  NOTE: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
};

type MemoryFactCardProps = {
  fact: MemoryFactView;
  /** Owner-only affordances (edit/forget/share) are hidden on read-only surfaces (e.g. admin). */
  readOnly?: boolean;
  /**
   * Whether the per-fact share control is meaningful. False when the platform admin has not
   * unlocked sharing OR the user has not opted in — in that case the control is shown disabled with
   * an explanation, rather than hidden (hiding it would make the feature undiscoverable) or shown
   * live (which would imply an exposure that cannot happen).
   */
  sharingActive?: boolean;
  /** Shown on admin surfaces so an admin can see who contributed a shared fact. */
  ownerEmail?: string | null;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onToggleShare?: (next: MemoryVisibility) => void;
};

/**
 * One memory fact. The card carries the whole privacy story for that fact:
 * a SHARED badge means "eligible to be seen by my admin", and PRIVATE means "never".
 */
export const MemoryFactCard = ({
  fact,
  readOnly = false,
  sharingActive = false,
  ownerEmail,
  onEdit,
  onDelete,
  onToggleShare,
}: MemoryFactCardProps) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(fact.content);

  const isShared = fact.visibility === MemoryVisibility.SHARED;

  const save = () => {
    const next = draft.trim();
    if (next && next !== fact.content) onEdit?.(next);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card p-4 transition-all',
        'hover:border-primary/30 hover:shadow-md',
        isShared && 'border-primary/25 bg-primary/[0.02]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                autoFocus
                className="resize-none text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={save}>
                  <Check className="mr-1 size-3.5" />
                  {t('Save')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(fact.content);
                    setEditing(false);
                  }}
                >
                  <X className="mr-1 size-3.5" />
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {fact.content}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn('text-[10px] font-medium', KIND_STYLES[fact.kind])}
            >
              {fact.kind}
            </Badge>

            {fact.source === 'AUTO' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] font-normal text-muted-foreground"
                  >
                    <Sparkles className="size-2.5" />
                    {t('Auto-saved')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {t('Your agent saved this while working on a task.')}
                </TooltipContent>
              </Tooltip>
            )}

            {ownerEmail && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] font-normal text-muted-foreground"
              >
                <User2 className="size-2.5" />
                {ownerEmail}
              </Badge>
            )}

            <span className="text-[11px] text-muted-foreground">
              {formatUtils.formatDateToAgo(new Date(fact.created))}
            </span>

            {/* The privacy state, always visible — never a hidden default. */}
            {isShared ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="gap-1 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/15">
                    <Share2 className="size-2.5" />
                    {t('Shared with admin')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px]">
                  {sharingActive
                    ? t(
                        'Your platform admin can see this fact. Mark it private at any time to take it back.',
                      )
                    : t(
                        'Marked shareable, but not visible to anyone yet — sharing is currently switched off.',
                      )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] font-normal text-muted-foreground"
                  >
                    <Lock className="size-2.5" />
                    {t('Private')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px]">
                  {t(
                    'Only you can ever see this. It stays invisible to your admin even if you turn sharing on.',
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {!readOnly && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={t('Memory actions')}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  setDraft(fact.content);
                  setEditing(true);
                }}
              >
                <Pencil className="mr-2 size-3.5" />
                {t('Edit')}
              </DropdownMenuItem>

              {onToggleShare && (
                <DropdownMenuItem
                  onClick={() =>
                    onToggleShare(
                      isShared
                        ? MemoryVisibility.PRIVATE
                        : MemoryVisibility.SHARED,
                    )
                  }
                >
                  {isShared ? (
                    <>
                      <Lock className="mr-2 size-3.5" />
                      {t('Make permanently private')}
                    </>
                  ) : (
                    <>
                      <Share2 className="mr-2 size-3.5" />
                      {t('Mark shareable with admin')}
                    </>
                  )}
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-3.5" />
                {t('Forget this')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};
