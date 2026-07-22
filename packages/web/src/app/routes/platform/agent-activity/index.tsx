import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';

import LockedFeatureGuard from '@/app/components/locked-feature-guard';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { agentRunUtils } from '@/features/browser-agent/lib/agent-run-utils';
import { platformHooks } from '@/hooks/platform-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="text-muted-foreground pt-0 text-xs">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

export default function AgentActivityPage({
  variant = 'default',
}: {
  variant?: 'default' | 'overhaul';
} = {}) {
  const isOverhaul = variant === 'overhaul';
  const { platform } = platformHooks.useCurrentPlatform();
  const projectId = authenticationSession.getProjectId()!;
  const [days, setDays] = useState('30');

  const { data, isLoading } = useQuery({
    queryKey: ['agent-oversight', projectId, days],
    queryFn: () => browserAgentApi.oversight({ projectId, days: Number(days) }),
    staleTime: 60_000,
  });

  return (
    <LockedFeatureGuard
      featureKey="AGENTS"
      locked={!platform.plan.browserAgentEnabled}
      lockTitle={t('Unlock Agent Activity')}
      lockDescription={t(
        'See how your team uses the Intellisper agent — runs, active users, and token spend.',
      )}
    >
      <div className="flex w-full flex-col gap-6">
        <div
          className={
            isOverhaul
              ? 'flex items-center justify-end'
              : 'flex items-center justify-between'
          }
        >
          {!isOverhaul && (
            <div>
              <h1 className="text-2xl font-semibold">{t('Agent Activity')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('Platform-wide browser-agent usage across your users.')}
              </p>
            </div>
          )}
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('Last 7 days')}</SelectItem>
              <SelectItem value="30">{t('Last 30 days')}</SelectItem>
              <SelectItem value="90">{t('Last 90 days')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading || !data ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric
                label={t('Total runs')}
                value={formatUtils.formatNumber(data.totalRuns)}
              />
              <Metric
                label={t('Active users')}
                value={formatUtils.formatNumber(data.activeUsers)}
              />
              <Metric
                label={t('Token spend')}
                value={formatUtils.formatNumberCompact(data.totalTokenCost)}
                hint={t('Billed tokens across the window.')}
              />
              <Metric
                label={t('Success rate')}
                value={`${(data.successRate * 100).toFixed(1)}%`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('Runs by status')}</CardTitle>
                <CardDescription>
                  {t('How runs ended across the window.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.runsByStatus.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center text-sm">
                    {t('No runs in this window.')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {data.runsByStatus.map((row) => {
                      const { variant, Icon } = agentRunUtils.getStatusIcon(
                        row.status,
                      );
                      return (
                        <div
                          key={row.status}
                          className="flex items-center gap-2"
                        >
                          <StatusIconWithText
                            icon={Icon}
                            text={formatUtils.convertEnumToReadable(row.status)}
                            variant={variant}
                          />
                          <span className="text-sm font-medium">
                            {formatUtils.formatNumber(row.count)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('By user')}</CardTitle>
                <CardDescription>
                  {t('Agent usage per user in this platform.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.byUser.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    {t('No agent usage in this window.')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('User')}</TableHead>
                        <TableHead className="text-right">
                          {t('Runs')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('Tokens')}
                        </TableHead>
                        <TableHead>{t('Last run')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byUser.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-medium">
                            {row.userId}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUtils.formatNumber(row.runs)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUtils.formatNumberCompact(row.tokenCost)}
                          </TableCell>
                          <TableCell>
                            {row.lastRunAt ? (
                              <FormattedDate
                                date={new Date(row.lastRunAt)}
                                includeTime
                              />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Top routines')}</CardTitle>
                <CardDescription>
                  {t('Most-run saved routines in this window.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.topRoutines.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    {t('No routine runs in this window.')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Routine')}</TableHead>
                        <TableHead className="text-right">
                          {t('Runs')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topRoutines.map((row) => (
                        <TableRow key={row.routineId}>
                          <TableCell className="font-medium">
                            {row.name || row.routineId}
                            {!row.name && (
                              <Badge variant="outline" className="ml-2">
                                {t('Unnamed')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatUtils.formatNumber(row.runs)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </LockedFeatureGuard>
  );
}
