import { PlatformAnalyticsReport, UserStatus } from '@intelblocks/shared';
import { t } from 'i18next';
import { Users } from 'lucide-react';

import { MetricCard, MetricCardSkeleton } from './metric-card';

type ActiveUsersMetricProps = {
  report?: PlatformAnalyticsReport;
  variant?: 'default' | 'overhaul';
  index?: number;
};

export const ActiveUsersMetric = ({
  report,
  variant = 'default',
  index = 0,
}: ActiveUsersMetricProps) => {
  if (!report) {
    return <MetricCardSkeleton variant={variant} />;
  }

  const activeUsers = report.users.filter(
    (user) => user.status === UserStatus.ACTIVE,
  ).length;
  const totalUsers = report.users.length;

  const adoptionRate =
    totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

  return (
    <MetricCard
      icon={Users}
      title={t('Active Users')}
      value={activeUsers.toLocaleString()}
      description={t('Users actively using the platform')}
      subtitle={t('{rate}% adoption rate ({total} total users)', {
        rate: adoptionRate,
        total: totalUsers.toLocaleString(),
      })}
      iconColor="text-chart-2"
      iconBgColor="bg-chart-2/10"
      variant={variant}
      index={index}
    />
  );
};
