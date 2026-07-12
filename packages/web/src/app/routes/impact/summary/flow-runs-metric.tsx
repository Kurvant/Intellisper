import { PlatformAnalyticsReport } from '@intelblocks/shared';
import { t } from 'i18next';
import { Zap } from 'lucide-react';

import { MetricCard, MetricCardSkeleton } from './metric-card';

type FlowRunsMetricProps = {
  report?: PlatformAnalyticsReport;
};

export const FlowRunsMetric = ({ report }: FlowRunsMetricProps) => {
  if (!report) {
    return <MetricCardSkeleton />;
  }

  const totalFlowRuns = report.flows.reduce(
    (acc, flow) =>
      acc + (report?.runs.find((run) => run.flowId === flow.flowId)?.runs ?? 0),
    0,
  );

  return (
    <MetricCard
      icon={Zap}
      title={t('Automation Runs')}
      value={totalFlowRuns.toLocaleString()}
      description={t('Total automation executions')}
      iconColor="text-chart-3"
      iconBgColor="bg-chart-3/10"
    />
  );
};
