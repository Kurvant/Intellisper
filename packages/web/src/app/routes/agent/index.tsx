import { AgentRunStatus } from '@intelblocks/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Coins,
} from 'lucide-react';
import { useState } from 'react';

import LockedFeatureGuard from '@/app/components/locked-feature-guard';
import { MetricCard } from '@/app/routes/impact/summary/metric-card';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { browserAgentApi } from '@/features/browser-agent/api/browser-agent-api';
import {
  agentRunUtils,
  formatTokens,
  isAgentRunNonTerminal,
} from '@/features/browser-agent/lib/agent-run-utils';
import { platformHooks } from '@/hooks/platform-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: AgentRunStatus[] = [
  AgentRunStatus.PENDING,
  AgentRunStatus.RUNNING,
  AgentRunStatus.AWAITING_CONFIRMATION,
  AgentRunStatus.COMPLETED,
  AgentRunStatus.HALTED,
  AgentRunStatus.FAILED,
];

const ALL_STATUSES = 'ALL';

function runDurationMs(
  startedAt: string | null,
  endedAt: string | null,
): number | undefined {
  if (!startedAt || !endedAt) {
    return undefined;
  }
  return new Date(endedAt).getTime() - new Date(startedAt).getTime();
}

export default function AgentActivityPage({
  variant = 'default',
}: {
  variant?: 'default' | 'overhaul';
} = {}) {
  const isOverhaul = variant === 'overhaul';
  const { platform } = platformHooks.useCurrentPlatform();
  const projectId = authenticationSession.getProjectId()!;

  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [page, setPage] = useState(1);

  const status =
    statusFilter === ALL_STATUSES
      ? undefined
      : (statusFilter as AgentRunStatus);

  const { data: runsData, isLoading: isRunsLoading } = useQuery({
    queryKey: ['browser-agent-runs', projectId, status, page],
    queryFn: () =>
      browserAgentApi.listRuns({ projectId, status, page, limit: PAGE_SIZE }),
    staleTime: 0,
    refetchInterval: (query) => {
      const hasActive = query.state.data?.runs?.some((run) =>
        isAgentRunNonTerminal(run.status),
      );
      return hasActive ? 15 * 1000 : false;
    },
  });

  const { data: usageData } = useQuery({
    queryKey: ['browser-agent-usage', projectId],
    queryFn: () => browserAgentApi.usage(projectId),
    staleTime: 60_000,
  });

  const runs = runsData?.runs ?? [];
  const total = runsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stepsOnPage = runs.reduce((sum, run) => sum + run.stepCount, 0);

  const actionsMetric = usageData?.metrics.find((m) => m.metric === 'ACTIONS');
  const routineMetric = usageData?.metrics.find(
    (m) => m.metric === 'ROUTINE_RUNS',
  );

  const usageValue = (used: number, cap: number) => {
    if (cap === -1) {
      return `${formatUtils.formatNumber(used)} / ${t('Unlimited')}`;
    }
    if (cap === 0) {
      return t('N/A');
    }
    return `${formatUtils.formatNumber(used)} / ${formatUtils.formatNumber(
      cap,
    )}`;
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <LockedFeatureGuard
      featureKey="AGENTS"
      locked={!platform.plan.browserAgentEnabled}
      lockTitle={t('Unlock My Agent')}
      lockDescription={t(
        'Run browser tasks with the Intellisper agent and track their activity here.',
      )}
    >
      <div
        className={
          isOverhaul
            ? 'flex w-full flex-col gap-6'
            : 'flex w-full flex-col gap-6 p-6'
        }
      >
        {!isOverhaul && (
          <div className="flex items-center gap-2">
            <Bot className="size-6" />
            <h1 className="text-2xl font-semibold">{t('My Agent')}</h1>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            icon={Activity}
            title={t('Runs')}
            value={formatUtils.formatNumber(total)}
            description={t('Total agent runs in this project.')}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
          />
          <MetricCard
            icon={Footprints}
            title={t('Steps')}
            value={formatUtils.formatNumber(stepsOnPage)}
            description={t('Total steps across the runs shown on this page.')}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
          />
          <MetricCard
            icon={Bot}
            title={t('Actions')}
            value={
              actionsMetric
                ? usageValue(actionsMetric.used, actionsMetric.cap)
                : '—'
            }
            description={t('Browser actions used against your plan cap.')}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
          />
          <MetricCard
            icon={Coins}
            title={t('Routine runs')}
            value={
              routineMetric
                ? usageValue(routineMetric.used, routineMetric.cap)
                : '—'
            }
            description={t('Saved-routine executions used against your cap.')}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
          />
        </div>

        <div className="flex items-center justify-end">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>{t('All statuses')}</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatUtils.convertEnumToReadable(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isRunsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="text-muted-foreground py-16 text-center text-sm">
            {t(
              'No agent runs yet. Start a task from the Intellisper extension to see your activity here.',
            )}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Task')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Steps')}</TableHead>
                  <TableHead className="text-right">{t('Tokens')}</TableHead>
                  <TableHead>{t('Started')}</TableHead>
                  <TableHead>{t('Duration')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const { variant, Icon } = agentRunUtils.getStatusIcon(
                    run.status,
                  );
                  const durationMs = runDurationMs(run.startedAt, run.endedAt);
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="max-w-xs truncate font-medium">
                        {run.title || t('Untitled task')}
                      </TableCell>
                      <TableCell>
                        <StatusIconWithText
                          icon={Icon}
                          text={formatUtils.convertEnumToReadable(run.status)}
                          variant={variant}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatUtils.formatNumber(run.stepCount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatTokens(run.tokenCost)}
                      </TableCell>
                      <TableCell>
                        {run.startedAt ? (
                          <FormattedDate
                            date={new Date(run.startedAt)}
                            includeTime
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {durationMs !== undefined
                          ? formatUtils.formatDuration(durationMs, true)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t('Page {page} of {totalPages}', { page, totalPages })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  {t('Previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('Next')}
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </LockedFeatureGuard>
  );
}
