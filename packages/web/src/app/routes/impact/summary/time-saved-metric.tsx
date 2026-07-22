import { PlatformAnalyticsReport } from '@intelblocks/shared';
import { t } from 'i18next';
import { Clock } from 'lucide-react';

import { formatUtils } from '@/lib/format-utils';

import { MetricCard, MetricCardSkeleton } from './metric-card';

type TimeSavedMetricProps = {
  report?: PlatformAnalyticsReport;
  isLoading: boolean;
  variant?: 'default' | 'overhaul';
  index?: number;
};

export const TimeSavedMetric = ({
  report,
  isLoading,
  variant = 'default',
  index = 0,
}: TimeSavedMetricProps) => {
  const flows = report?.flows ?? [];

  const flowsWithTimeSaved = flows.filter(
    (flow) =>
      flow.timeSavedPerRun !== null &&
      flow.timeSavedPerRun !== undefined &&
      flow.timeSavedPerRun !== 0,
  );
  const atLeastOneTimeSavedSet = flowsWithTimeSaved.length > 0;

  const totalSeconds = atLeastOneTimeSavedSet
    ? flowsWithTimeSaved.reduce((acc, flow) => {
        const totalRuns =
          report?.runs
            .filter((run) => run.flowId === flow.flowId)
            .reduce((sum, run) => sum + (run.runs ?? 0), 0) ?? 0;
        return acc + (flow.timeSavedPerRun ?? 0) * totalRuns;
      }, 0)
    : 0;
  const totalMinutes = Math.round(totalSeconds / 60);
  const equivalentWorkdays = Math.round(totalSeconds / 3600 / 8);

  if (isLoading) {
    return <MetricCardSkeleton variant={variant} />;
  }

  if (!atLeastOneTimeSavedSet) {
    return (
      <MetricCard
        icon={Clock}
        title={t('Time Saved')}
        value="N/A"
        description={t(
          'Estimated hours saved through automation in the last 3 months. Each automated task saves valuable employee time that can be redirected to high-impact work.',
        )}
        subtitle={t('{days} workdays saved', {
          days: 'N/A',
        })}
        iconColor="text-chart-5"
        iconBgColor="bg-chart-5/10"
        variant={variant}
        index={index}
      />
    );
  }

  return (
    <MetricCard
      icon={Clock}
      title={t('Time Saved')}
      value={`${formatUtils.formatNumber(totalMinutes)} mins`}
      description={t('Total time saved by automation')}
      subtitle={t('{days} workdays saved', {
        days: equivalentWorkdays.toLocaleString(),
      })}
      iconColor="text-success"
      iconBgColor="bg-success/10"
      variant={variant}
      index={index}
    />
  );
};
