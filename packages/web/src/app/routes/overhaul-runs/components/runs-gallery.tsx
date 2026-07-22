import { FlowRetryStrategy, FlowRunStatus } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  ChevronLeft,
  ChevronRight,
  History,
  RotateCw,
  Search,
  ToggleLeft,
  Workflow,
  X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { MessageTooltip } from '@/components/custom/message-tooltip';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRunsController } from '@/features/flow-runs';
import { FailedRetryRunsDialog } from '@/features/flow-runs/components/runs-table/failed-retry-runs-dialog';
import { FailedStepDialog } from '@/features/flow-runs/components/runs-table/failed-step-dialog';
import { RetriedRunsSnackbar } from '@/features/flow-runs/components/runs-table/retried-runs-snackbar';
import { RunsStatusChart } from '@/features/flow-runs/components/runs-table/runs-status-chart';
import { flowRunQueries } from '@/features/flow-runs/hooks/flow-run-hooks';
import { flowRunUtils } from '@/features/flow-runs/utils/flow-run-utils';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { OvMultiSelect } from '../../overhaul-automations/components/ov-multi-select';
import type { OvFilterOption } from '../../overhaul-automations/components/ov-multi-select';

import { OvRunCard } from './ov-run-card';

const PAGE_SIZE_OPTIONS = [10, 30, 50];

/**
 * Summary stat bento row. Reuses flowRunQueries.useRunStats (same Succeeded/Failed/Running/Queued/
 * Paused/Canceled categories + total the RunsStatusChart uses) so the tiles reflect real data. Does
 * NOT replace the chart — the chart stays in the toolbar for the full breakdown.
 */
function RunsStatBento() {
  const { categories, total } = flowRunQueries.useRunStats();
  const countFor = (label: string) =>
    categories.find((c) => c.label === label)?.count ?? 0;

  const tiles = [
    {
      key: 'total',
      label: t('Total Runs'),
      value: total,
      valueClass: 'text-foreground',
      dot: null as ReactNode,
    },
    {
      key: 'failed',
      label: t('Failed'),
      value: countFor('Failed'),
      valueClass: 'text-destructive',
      dot: <span className="size-2 rounded-full bg-destructive" aria-hidden />,
    },
    {
      key: 'running',
      label: t('Running'),
      value: countFor('Running'),
      valueClass: 'text-primary',
      dot: (
        <span
          className="size-2 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
      ),
    },
    {
      key: 'queued',
      label: t('Queued'),
      value: countFor('Queued'),
      valueClass: 'text-foreground',
      dot: (
        <span
          className="size-2 rounded-full border border-dashed border-muted-foreground"
          aria-hidden
        />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <div
          key={tile.key}
          className="ov-glass ov-slide-in-up flex flex-col gap-1 rounded-xl p-4"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {tile.dot}
            {tile.label}
          </div>
          <span
            className={cn(
              'text-2xl font-semibold tabular-nums',
              tile.valueClass,
            )}
          >
            {formatUtils.formatNumberCompact(tile.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Card-gallery presentation of Flow Runs. Renders from the SHARED useRunsController, so it keeps
 * every capability of the table: URL-param filters (flow / status / error message), the queue-status
 * chart, cursor pagination, select-all-across-pages + exclusions, bulk archive / cancel /
 * retry-on-latest / retry-from-failed with identical gates, retried-runs view + snackbar, and the
 * failed-retry / failed-step dialogs. Row click opens the run (ctrl-click new window).
 */
export function RunsGallery() {
  const c = useRunsController();
  const [searchParams, setSp] = useSearchParams();
  const [retryOpen, setRetryOpen] = useState(false);

  const runs = c.data?.data ?? [];
  const statusFilter = searchParams.getAll('status');
  const flowFilter = searchParams.getAll('flowId');
  const errorMessage = searchParams.get('failedStepMessage') ?? '';
  const viewingRetried = c.retriedRunsInQueryParams.length > 0;

  const updateParams = (mutate: (p: URLSearchParams) => void) => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        next.delete(CURSOR_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
    c.resetSelection();
  };
  const setMulti = (key: string, values: string[]) =>
    updateParams((p) => {
      p.delete(key);
      values.forEach((v) => p.append(key, v));
    });
  const setErrorMessage = (value: string) =>
    updateParams((p) => {
      if (value) p.set('failedStepMessage', value);
      else p.delete('failedStepMessage');
    });
  const setPageSize = (size: number) =>
    updateParams((p) => p.set(LIMIT_QUERY_PARAM, String(size)));
  const goToCursor = (cursor: string | null | undefined) => {
    if (!cursor) return;
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(CURSOR_QUERY_PARAM, cursor);
        return next;
      },
      { replace: true },
    );
    c.resetSelection();
  };

  const flowOptions: OvFilterOption[] = (c.flows ?? []).map((f) => ({
    value: f.id,
    label: f.version.displayName,
  }));
  const statusOptions: OvFilterOption[] = Object.values(FlowRunStatus).map(
    (s) => ({
      value: s,
      label: formatUtils.convertEnumToHumanReadable(s),
      icon: (() => {
        const { Icon } = flowRunUtils.getStatusIcon(s);
        return <Icon className="h-4 w-4" />;
      })(),
    }),
  );

  const selectedIds = new Set(c.selectedRows.map((r) => r.id));
  const isRunSelected = (id: string) => c.selectedAll || selectedIds.has(id);
  const toggleRun = (id: string, status: FlowRunStatus) => {
    if (c.selectedAll) {
      // In select-all mode, toggling a card toggles its exclusion.
      c.setExcludedRows((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    c.setSelectedRows((prev) =>
      prev.some((r) => r.id === id)
        ? prev.filter((r) => r.id !== id)
        : [...prev, { id, status }],
    );
  };
  const selectedCount = c.selectedAll
    ? runs.length - c.excludedRows.size
    : c.selectedRows.length;

  const retryDisabled =
    c.selectedRows.length === 0 || !c.userHasPermissionToRetryRun;
  const cancelDisabled =
    c.selectedRows.length === 0 ||
    !c.userHasPermissionToRetryRun ||
    !c.allCancellable;

  const isEmpty = !c.isLoading && runs.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary stat bento (reuses useRunStats — same categories as the queue chart) */}
      <RunsStatBento />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {viewingRetried ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSp({}, { replace: true })}
          >
            {t('Viewing retried runs')} ({c.retriedRunsInQueryParams.length}){' '}
            <X className="ml-1 size-4" />
          </Button>
        ) : (
          <>
            <OvMultiSelect
              label={t('Flow')}
              icon={<Workflow className="h-3.5 w-3.5" />}
              options={flowOptions}
              selectedValues={flowFilter}
              onChange={(v) => setMulti('flowId', v)}
              searchable
            />
            <OvMultiSelect
              label={t('Status')}
              icon={<ToggleLeft className="h-3.5 w-3.5" />}
              options={statusOptions}
              selectedValues={statusFilter}
              onChange={(v) => setMulti('status', v)}
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                placeholder={t('Error message')}
                className="h-9 w-[200px] rounded-lg border border-border bg-card pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          </>
        )}
        <div className="ml-auto">
          <RunsStatusChart />
        </div>
      </div>

      {/* Grid / states */}
      {c.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-[128px] animate-pulse rounded-xl border border-border/70 bg-muted/40"
            />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="ov-glass ov-slide-in-up flex flex-col items-center justify-center rounded-xl py-16 text-center">
          <History className="size-12 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">{t('No flow runs found')}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t('Come back later when your automations start running')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run, i) => (
            <OvRunCard
              key={run.id}
              run={run}
              index={i}
              isSelected={isRunSelected(run.id)}
              onToggleSelect={() => toggleRun(run.id, run.status)}
              onOpen={() => c.openRun(run)}
              onOpenNewWindow={() => c.openRunNewWindow(run)}
              onViewError={() => c.setErrorDialogRun(run)}
              canViewInternalError={c.canViewInternalError}
            />
          ))}
        </div>
      )}

      {/* Cursor pagination */}
      {!isEmpty && !viewingRetried && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('Rows per page')}</span>
            <Select
              value={String(
                searchParams.get(LIMIT_QUERY_PARAM)
                  ? parseInt(searchParams.get(LIMIT_QUERY_PARAM)!)
                  : 10,
              )}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!c.data?.previous}
              onClick={() => goToCursor(c.data?.previous)}
            >
              <ChevronLeft className="mr-1 size-4" />
              {t('Previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!c.data?.next}
              onClick={() => goToCursor(c.data?.next)}
            >
              {t('Next')}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="ov-glass ov-slide-in-up fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 shadow-xl">
          <span className="mr-1 text-sm font-medium">
            {t('{count} selected', { count: selectedCount })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              c.selectedRows.length === 0 || !c.userHasPermissionToRetryRun
            }
            loading={c.archiveIsPending}
            onClick={c.doArchive}
          >
            {t('Archive')}
          </Button>
          <PermissionNeededTooltip
            hasPermission={c.userHasPermissionToRetryRun}
          >
            <MessageTooltip
              message={t('Only paused or queued runs can be cancelled')}
              isDisabled={c.allCancellable}
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={cancelDisabled}
                loading={c.cancelIsPending}
                onClick={c.doCancel}
              >
                {t('Cancel')}
              </Button>
            </MessageTooltip>
          </PermissionNeededTooltip>
          <PermissionNeededTooltip
            hasPermission={c.userHasPermissionToRetryRun}
          >
            <DropdownMenu
              open={retryOpen}
              onOpenChange={setRetryOpen}
              modal={false}
            >
              <DropdownMenuTrigger asChild disabled={retryDisabled}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={retryDisabled}
                  loading={c.retryIsPending}
                >
                  <RotateCw className="mr-1 size-4" />
                  {t('Retry')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  disabled={!c.userHasPermissionToRetryRun}
                  onClick={() => c.doRetry(FlowRetryStrategy.ON_LATEST_VERSION)}
                >
                  {t('on latest version')}
                </DropdownMenuItem>
                {c.anyFailed && (
                  <MessageTooltip
                    message={t(
                      'Only failed runs can be retried from failed step',
                    )}
                    isDisabled={!c.allFailed}
                  >
                    <DropdownMenuItem
                      disabled={!c.userHasPermissionToRetryRun || !c.allFailed}
                      onClick={() =>
                        c.doRetry(FlowRetryStrategy.FROM_FAILED_STEP)
                      }
                    >
                      {t('from failed step')}
                    </DropdownMenuItem>
                  </MessageTooltip>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionNeededTooltip>
          <Button variant="ghost" size="sm" onClick={c.resetSelection}>
            {t('Clear')}
          </Button>
        </div>
      )}

      <RetriedRunsSnackbar
        retriedRunsIds={c.retriedRunsIds}
        clearRetriedRuns={() => c.setRetriedRunsIds([])}
      />
      <FailedRetryRunsDialog
        open={c.failedRetryDialogOpen}
        onOpenChange={c.setFailedRetryDialogOpen}
        failedRuns={c.failedRetryRuns}
      />
      <FailedStepDialog
        run={c.errorDialogRun}
        open={c.errorDialogRun !== null}
        onOpenChange={(open) => {
          if (!open) c.setErrorDialogRun(null);
        }}
      />
    </div>
  );
}
