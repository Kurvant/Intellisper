import { FlowRun, FlowRunStatus, isNil } from '@intelblocks/shared';
import { t } from 'i18next';
import { AlertCircle, Archive, Clock, Hourglass } from 'lucide-react';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { flowRunUtils } from '@/features/flow-runs/utils/flow-run-utils';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

/**
 * A single flow run as a premium glassmorphism card (gallery presentation). Same capabilities as the
 * table row: open run (click / ctrl-click new window), select, status badge (with a pulse dot for
 * running), flow name + a mono run-id subtitle, started-at, duration, and the failure "View error"
 * affordance (with the same platform-admin gate for internal errors). Presentation only — all logic
 * comes from useRunsController via runs-gallery.
 */

// Maps flowRunUtils.getStatusIcon variants to badge color classes for the card status pill.
const STATUS_BADGE_CLASS: Record<'default' | 'success' | 'error', string> = {
  success:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  error:
    'border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive',
  default: 'border-border bg-muted/60 text-muted-foreground',
};

export function OvRunCard({
  run,
  index = 0,
  isSelected,
  onToggleSelect,
  onOpen,
  onOpenNewWindow,
  onViewError,
  canViewInternalError,
}: {
  run: FlowRun;
  index?: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onOpenNewWindow: () => void;
  onViewError: () => void;
  canViewInternalError: boolean;
}) {
  const { variant, Icon } = flowRunUtils.getStatusIcon(run.status);
  const displayName = run.flowVersion?.displayName ?? '—';
  const duration =
    run.startTime && run.finishTime
      ? new Date(run.finishTime).getTime() - new Date(run.startTime).getTime()
      : undefined;
  const isRunning = run.status === FlowRunStatus.RUNNING;

  const showViewError = Boolean(
    run.failedStep?.message ||
      (run.status === 'INTERNAL_ERROR' && canViewInternalError),
  );

  return (
    <div
      className={cn(
        'ov-glass ov-glass-hover ov-slide-in-up group relative flex cursor-pointer flex-col rounded-xl p-4 hover:-translate-y-0.5 hover:shadow-lg',
        isSelected && 'border-[#3B6EF5] ring-1 ring-[#3B6EF5]/40',
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) onOpenNewWindow();
        else onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 pt-0.5 transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={t('Select run')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!isNil(run.archivedAt) && (
              <Archive className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-medium" title={displayName}>
              {displayName}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] leading-none text-muted-foreground/80">
            {run.id}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
            isRunning
              ? 'border-primary/30 bg-primary/10 text-primary'
              : STATUS_BADGE_CLASS[variant],
          )}
        >
          {isRunning ? (
            <span
              className="size-1.5 animate-pulse rounded-full bg-primary"
              aria-hidden
            />
          ) : (
            <Icon className="size-3.5" />
          )}
          {formatUtils.convertEnumToHumanReadable(run.status)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
            <FormattedDate date={new Date(run.created)} />
          </span>
          <span className="flex items-center gap-1.5">
            {run.finishTime ? (
              <>
                <Hourglass className="size-3.5 shrink-0" />
                {formatUtils.formatDuration(duration)}
              </>
            ) : (
              <span>{t('In progress')}</span>
            )}
          </span>
        </div>
        {showViewError && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onViewError();
            }}
          >
            <AlertCircle className="size-3.5" />
            {t('View error')}
          </Button>
        )}
      </div>
    </div>
  );
}
