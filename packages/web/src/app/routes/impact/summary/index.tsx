import { PlatformAnalyticsReport } from '@intelblocks/shared';

import { ActiveFlowsMetric } from './active-flows-metric';
import { ActiveUsersMetric } from './active-users-metric';
import { FlowRunsMetric } from './flow-runs-metric';
import { TimeSavedMetric } from './time-saved-metric';

type SummaryProps = {
  report?: PlatformAnalyticsReport;
  variant?: 'default' | 'overhaul';
};

export function Summary({ report, variant = 'default' }: SummaryProps) {
  const isLoading = !report;

  return (
    <div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TimeSavedMetric
          isLoading={isLoading}
          report={report}
          variant={variant}
          index={0}
        />
        <ActiveFlowsMetric report={report} variant={variant} index={1} />
        <ActiveUsersMetric report={report} variant={variant} index={2} />
        <FlowRunsMetric report={report} variant={variant} index={3} />
      </div>
    </div>
  );
}
