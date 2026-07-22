import {
  FlowRetryStrategy,
  FlowRun,
  FlowRunStatus,
  FlowRunWithRetryError,
  isFailedState,
  isFlowRunStateTerminal,
  Permission,
} from '@intelblocks/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { getDefaultRange } from '@/components/custom/date-time-picker-range';
import { flowRunsApi } from '@/features/flow-runs/api/flow-runs-api';
import {
  DEFAULT_DATE_PRESET,
  flowRunMutations,
} from '@/features/flow-runs/hooks/flow-run-hooks';
import { flowHooks } from '@/features/flows/hooks/flow-hooks';
import {
  useAuthorization,
  useIsPlatformAdmin,
} from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';

import { RUN_IDS_QUERY_PARAM } from './retried-runs-snackbar';

export type SelectedRow = {
  id: string;
  status: FlowRunStatus;
};

/**
 * Shared controller for the Flow Runs surface. Holds ALL of the Runs logic — the URL-param query +
 * polling, the select-all-across-pages + exclusions selection model, the three bulk mutations
 * (archive / cancel / retry-on-latest / retry-from-failed) with their exact gates, the retried-runs
 * navigation, the failed-retry + failed-step dialog state, and the row-open handlers — so BOTH the
 * table view and the card gallery render from one source of truth with zero capability drift.
 *
 * Extracted verbatim from the original RunsTable so the shipped table behavior is unchanged.
 */
export function useRunsController() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRows, setSelectedRows] = useState<Array<SelectedRow>>([]);
  const [selectedAll, setSelectedAll] = useState(false);
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set());

  const projectId = authenticationSession.getProjectId()!;
  const [retriedRunsIds, setRetriedRunsIds] = useState<string[]>([]);
  const [failedRetryRuns, setFailedRetryRuns] = useState<
    Required<FlowRunWithRetryError>[]
  >([]);
  const [failedRetryDialogOpen, setFailedRetryDialogOpen] = useState(false);
  const [errorDialogRun, setErrorDialogRun] = useState<FlowRun | null>(null);

  const [hasSeededDefaultRange, setHasSeededDefaultRange] = useState(() =>
    searchParams.has('createdAfter'),
  );
  useEffect(() => {
    if (hasSeededDefaultRange) return;
    const range = getDefaultRange(DEFAULT_DATE_PRESET);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!next.has('createdAfter')) {
          next.set('createdAfter', range.from.toISOString());
          next.set('createdBefore', range.to.toISOString());
        }
        return next;
      },
      { replace: true },
    );
    setHasSeededDefaultRange(true);
  }, [hasSeededDefaultRange, setSearchParams]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['flow-run-table', searchParams.toString(), projectId],
    enabled: hasSeededDefaultRange,
    staleTime: 0,
    gcTime: 0,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
    queryFn: () => {
      const status = searchParams.getAll('status') as FlowRunStatus[];
      const flowId = searchParams.getAll('flowId');
      const cursor = searchParams.get(CURSOR_QUERY_PARAM);
      const flowRunIds = searchParams.getAll(RUN_IDS_QUERY_PARAM);
      const failedStepName = searchParams.get('failedStepName') || undefined;
      const failedStepMessage =
        searchParams.get('failedStepMessage') || undefined;
      const limit = searchParams.get(LIMIT_QUERY_PARAM)
        ? parseInt(searchParams.get(LIMIT_QUERY_PARAM)!)
        : 10;

      const createdAfter = searchParams.get('createdAfter');
      const createdBefore = searchParams.get('createdBefore');
      const archivedParam = searchParams.get('archivedAt');

      return flowRunsApi.list({
        status: status ?? undefined,
        projectId,
        flowId,
        cursor: cursor ?? undefined,
        limit,
        includeArchived: archivedParam === 'true',
        createdAfter: createdAfter ?? undefined,
        createdBefore: createdBefore ?? undefined,
        failedStepName,
        failedStepMessage,
        flowRunIds,
      });
    },
    refetchInterval: (query) => {
      const allRuns = query.state.data?.data;
      const runningRuns = allRuns?.filter(
        (run) =>
          !isFlowRunStateTerminal({
            status: run.status,
            ignoreInternalError: false,
          }),
      );
      return runningRuns?.length ? 15 * 1000 : false;
    },
  });

  const navigate = useNavigate();
  const openNewWindow = useNewWindow();
  const isPlatformAdmin = useIsPlatformAdmin();
  const canViewInternalError = isPlatformAdmin;

  const { data: flowsData, isFetching: isFetchingFlows } = flowHooks.useFlows({
    limit: 1000,
    cursor: undefined,
  });
  const flows = flowsData?.data;
  const { checkAccess } = useAuthorization();
  const userHasPermissionToRetryRun = checkAccess(Permission.WRITE_RUN);

  const resetSelection = () => {
    setSelectedRows([]);
    setSelectedAll(false);
    setExcludedRows(new Set());
  };

  const retryRuns = flowRunMutations.useBulkRetryRuns({
    onSuccess: (runs) => {
      const runsIds = runs.map((run) => run.id);
      setRetriedRunsIds(runsIds);
      const isAlreadyViewingRetriedRuns = searchParams.get(RUN_IDS_QUERY_PARAM);
      refetch();
      if (isAlreadyViewingRetriedRuns) {
        navigate(authenticationSession.appendProjectRoutePrefix(`/runs`));
        setSearchParams({
          [RUN_IDS_QUERY_PARAM]: runsIds,
          [LIMIT_QUERY_PARAM]: runsIds.length.toString(),
        });
      }
    },
    onPartialFailure: (failedRuns) => {
      setFailedRetryRuns(failedRuns);
      toast.error(
        t('{count} run(s) failed to retry', { count: failedRuns.length }),
        {
          action: {
            label: t('More'),
            onClick: () => setFailedRetryDialogOpen(true),
          },
          duration: 15000,
          closeButton: true,
          dismissible: true,
        },
      );
    },
  });

  const cancelRuns = flowRunMutations.useBulkCancelRuns({
    onSuccess: () => {
      refetch();
      resetSelection();
    },
  });

  const archiveRuns = flowRunMutations.useBulkArchiveRuns({
    onSuccess: () => {
      refetch();
    },
  });

  const commonFilterParams = () => ({
    status:
      searchParams.getAll('status').length > 0
        ? (searchParams.getAll('status') as FlowRunStatus[])
        : undefined,
    flowId: searchParams.getAll('flowId'),
    createdAfter: searchParams.get('createdAfter') || undefined,
    createdBefore: searchParams.get('createdBefore') || undefined,
    failedStepName: searchParams.get('failedStepName') || undefined,
    failedStepMessage: searchParams.get('failedStepMessage') || undefined,
  });

  const doArchive = () => {
    const runIds = selectedRows.map((row) => row.id);
    archiveRuns.mutate({
      projectId,
      flowRunIds: selectedAll ? undefined : runIds,
      excludeFlowRunIds: selectedAll ? Array.from(excludedRows) : undefined,
      ...commonFilterParams(),
    });
    setSelectedRows([]);
  };

  const doCancel = () => {
    const runIds = selectedRows.map((row) => row.id);
    const status = searchParams.getAll('status') as FlowRunStatus[];
    cancelRuns.mutate({
      projectId,
      flowRunIds: selectedAll ? undefined : runIds,
      excludeFlowRunIds: selectedAll ? Array.from(excludedRows) : undefined,
      status:
        status.length > 0
          ? (status.filter(
              (s) => s === FlowRunStatus.PAUSED || s === FlowRunStatus.QUEUED,
            ) as (typeof FlowRunStatus.PAUSED | typeof FlowRunStatus.QUEUED)[])
          : undefined,
      flowId: searchParams.getAll('flowId'),
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
    });
  };

  const doRetry = (strategy: FlowRetryStrategy) => {
    const runIds = selectedRows.map((row) => row.id);
    retryRuns.mutate({
      projectId,
      flowRunIds: selectedAll ? undefined : runIds,
      strategy,
      excludeFlowRunIds: selectedAll ? Array.from(excludedRows) : undefined,
      status: searchParams.getAll('status') as FlowRunStatus[],
      flowId: searchParams.getAll('flowId'),
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
      failedStepName: searchParams.get('failedStepName') || undefined,
      failedStepMessage: searchParams.get('failedStepMessage') || undefined,
    });
    setSelectedRows([]);
    if (strategy === FlowRetryStrategy.FROM_FAILED_STEP) {
      setSelectedAll(false);
      setExcludedRows(new Set());
    }
  };

  const allCancellable = selectedRows.every(
    (row) =>
      row.status === FlowRunStatus.PAUSED ||
      row.status === FlowRunStatus.QUEUED,
  );
  const anyFailed = selectedRows.some((row) => isFailedState(row.status));
  const allFailed = selectedRows.every((row) => isFailedState(row.status));

  const openRun = (run: Pick<FlowRun, 'id'>) =>
    navigate(authenticationSession.appendProjectRoutePrefix(`/runs/${run.id}`));
  const openRunNewWindow = (run: Pick<FlowRun, 'id'>) =>
    openNewWindow(
      authenticationSession.appendProjectRoutePrefix(`/runs/${run.id}`),
    );

  const retriedRunsInQueryParams = searchParams.getAll(RUN_IDS_QUERY_PARAM);

  return {
    // data
    data,
    isLoading: isLoading || isFetchingFlows,
    refetch,
    flows,
    // selection
    selectedRows,
    setSelectedRows,
    selectedAll,
    setSelectedAll,
    excludedRows,
    setExcludedRows,
    resetSelection,
    // permissions
    userHasPermissionToRetryRun,
    canViewInternalError,
    // bulk mutations + gates
    doArchive,
    doCancel,
    doRetry,
    archiveIsPending: archiveRuns.isPending,
    cancelIsPending: cancelRuns.isPending,
    retryIsPending: retryRuns.isPending,
    allCancellable,
    anyFailed,
    allFailed,
    // retried runs
    retriedRunsIds,
    setRetriedRunsIds,
    retriedRunsInQueryParams,
    // dialogs
    failedRetryRuns,
    failedRetryDialogOpen,
    setFailedRetryDialogOpen,
    errorDialogRun,
    setErrorDialogRun,
    // navigation
    openRun,
    openRunNewWindow,
    navigate,
    searchParams,
    setSearchParams,
  };
}
