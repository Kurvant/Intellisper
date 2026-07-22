import { AppConnectionStatus, FlowStatus } from '@intelblocks/shared';
import { t } from 'i18next';
import { useNavigate } from 'react-router-dom';

import { Icon3d } from '@/components/icons-3d';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { appConnectionsQueries } from '@/features/connections/hooks/app-connections-hooks';
import {
  flowRunQueries,
  type RunStatusCategory,
} from '@/features/flow-runs/hooks/flow-run-hooks';
import { flowHooks } from '@/features/flows/hooks/flow-hooks';
import { userInvitationsHooks } from '@/features/members/hooks/user-invitations-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import { NewAppShell } from '../../components/overhaul/new-app-shell';

/**
 * Home command-center (Pillar 3c). Net-new landing surface that aggregates existing data into an
 * at-a-glance overview + quick actions. Additive: it removes no capability (the flows list still
 * lives under Build → Automations). This first pass focuses on the new layout/visual language;
 * live-data wiring is layered in as the surface is verified.
 */
export function OverhaulHomePage() {
  const navigate = useNavigate();
  const { data: user } = userHooks.useCurrentUser();
  const greeting = getGreeting();

  // ── Live data for the stat tiles ────────────────────────────────────────────
  // Enabled flows (the "Active flows" tile).
  const { data: enabledFlows, isLoading: flowsLoading } = flowHooks.useFlows({
    limit: 100,
    cursor: undefined,
    status: [FlowStatus.ENABLED],
  });
  // Pending project invitations (the "Active users" hint + a needs-attention alert).
  const { invitations } = userInvitationsHooks.useInvitations();
  // Project connections (the "Connections" tile) + how many need reconnecting.
  const projectId = authenticationSession.getProjectId() ?? '';
  const { data: connectionsPage, isLoading: connectionsLoading } =
    appConnectionsQueries.useAppConnections({
      request: { projectId, limit: 100, cursor: undefined },
      extraKeys: [projectId],
    });

  // Run stats (shared by the run-health card AND the needs-attention "failed runs" alert).
  const runStats = flowRunQueries.useRunStats();
  const failed =
    runStats.categories.find((c) => c.label === 'Failed')?.count ?? 0;

  const activeFlowCount = enabledFlows?.data.length ?? 0;
  const connections = connectionsPage?.data ?? [];
  const needReconnect = connections.filter(
    (c) => c.status === AppConnectionStatus.ERROR,
  ).length;
  const pendingInvites = invitations?.length ?? 0;

  return (
    <NewAppShell
      title={t('{greeting}, {name}', {
        greeting,
        name: user?.firstName ?? t('there'),
      })}
      subtitle={t("Here's what's happening across your workspace")}
      actions={
        // Project settings now lives in the shared shell top-bar chrome (ProjectChrome), so the
        // home header only carries the primary "New" action.
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/build/automations')}
        >
          <span className="text-base leading-none">+</span>
          {t('New')}
        </Button>
      }
    >
      <div className="mx-auto max-w-[1280px] px-7 py-6">
        {/* Hero + run-health */}
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <HeroCard
            onNewFlow={() => navigate('/build/automations')}
            activeFlows={activeFlowCount}
            totalRuns={runStats.total}
          />
          <RunHealthCard
            onClick={() => navigate('/operate/runs')}
            categories={runStats.categories}
            total={runStats.total}
            isLoading={runStats.isLoading}
          />
        </div>

        {/* Recent + needs-attention */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <RecentAutomationsCard
            onSeeAll={() => navigate('/build/automations')}
            onOpen={(flowId) => navigate(`/flows/${flowId}`)}
          />
          <NeedsAttentionCard
            navigate={navigate}
            failedRuns={failed}
            pendingInvites={pendingInvites}
            needReconnect={needReconnect}
          />
        </div>

        {/* Stat tiles */}
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <StatTile
            label={t('Active flows')}
            value={
              flowsLoading ? null : formatUtils.formatNumber(activeFlowCount)
            }
            hint={t('Enabled automations')}
            icon="flow"
          />
          <StatTile
            label={t('Pending invites')}
            value={formatUtils.formatNumber(pendingInvites)}
            hint={
              pendingInvites > 0
                ? t('Awaiting acceptance')
                : t('All invitations accepted')
            }
            icon="team"
          />
          <StatTile
            label={t('Connections')}
            value={
              connectionsLoading
                ? null
                : formatUtils.formatNumber(connections.length)
            }
            hint={
              needReconnect > 0
                ? t('{n} need reconnect', { n: needReconnect })
                : t('All healthy')
            }
            icon="connection"
          />
        </div>
      </div>
    </NewAppShell>
  );
}

function HeroCard({
  onNewFlow,
  activeFlows,
  totalRuns,
}: {
  onNewFlow: () => void;
  activeFlows: number;
  totalRuns: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#C4703A_0%,#B5652F_42%,#9A5220_100%)] p-6 text-white shadow-[0_1px_2px_rgba(16,22,35,.06),0_18px_40px_-20px_rgba(154,82,32,.55)]">
      {/* radial sheen + amber glow above the base gradient, below the content */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_12%_0%,rgba(255,220,150,.45)_0%,transparent_45%)]" />
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[radial-gradient(circle,rgba(245,184,24,.35)_0%,transparent_70%)]" />
      <div className="relative">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">
          {t('Command center')}
        </div>
        <h2 className="mt-1.5 text-[23px] font-bold leading-[1.15] tracking-tight text-white [text-wrap:balance]">
          {activeFlows > 0
            ? t('{n} automations running', { n: activeFlows })
            : t('Build your first automation')}
        </h2>
        <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-white/85">
          {totalRuns > 0
            ? t('{n} runs in the last 7 days across your workspace.', {
                n: formatUtils.formatNumber(totalRuns),
              })
            : t(
                'Automate your work on the web — start with a template or a blank flow.',
              )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <HeroChip
            icon="automation"
            label={t('New automation')}
            onClick={onNewFlow}
          />
          <HeroChip icon="table" label={t('New table')} onClick={onNewFlow} />
          <HeroChip
            icon="chat"
            label={t('Ask Intellisper')}
            onClick={onNewFlow}
          />
        </div>
      </div>
    </div>
  );
}

function HeroChip({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-white/25 bg-white/15 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/25"
    >
      <Icon3d name={icon} size={18} />
      {label}
    </button>
  );
}

function Card({
  cap,
  action,
  children,
  className,
}: {
  cap: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,22,35,.04),0_12px_28px_-18px_rgba(16,22,35,.22)] ' +
        (className ?? '')
      }
    >
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground/90">
          {cap}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function RunHealthCard({
  onClick,
  categories,
  total,
  isLoading,
}: {
  onClick: () => void;
  categories: RunStatusCategory[];
  total: number;
  isLoading: boolean;
}) {
  const succeeded = categories.find((c) => c.label === 'Succeeded')?.count ?? 0;
  const failed = categories.find((c) => c.label === 'Failed')?.count ?? 0;
  const successRate = total > 0 ? (succeeded / total) * 100 : 0;

  return (
    <Card cap={t('Run health · last 7 days')}>
      {isLoading ? (
        <div className="flex justify-between gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-between gap-3">
          <Metric n={formatUtils.formatNumber(total)} l={t('Runs')} d="" />
          <Metric
            n={`${successRate.toFixed(1)}%`}
            l={t('Success')}
            d=""
            up={successRate >= 95}
          />
          <Metric
            n={formatUtils.formatNumber(failed)}
            l={t('Failed')}
            d={failed > 0 ? t('needs retry') : ''}
          />
        </div>
      )}
      {/* Distribution bar across the run categories (real proportions, not a fake sparkline). */}
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          categories.map((c) => (
            <span
              key={c.label}
              className={
                c.label === 'Succeeded'
                  ? 'bg-success'
                  : c.label === 'Failed'
                  ? 'bg-destructive'
                  : 'bg-primary/60'
              }
              style={{ width: `${(c.count / total) * 100}%` }}
              title={`${c.label}: ${c.count}`}
            />
          ))}
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 text-xs font-semibold text-primary hover:underline"
      >
        {t('View all runs →')}
      </button>
    </Card>
  );
}

function Metric({
  n,
  l,
  d,
  up,
}: {
  n: string;
  l: string;
  d?: string;
  up?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
        {n}
      </span>
      <span className="text-xs text-muted-foreground">{l}</span>
      {d ? (
        <span
          className={
            'text-[11.5px] font-semibold ' +
            (up ? 'text-success' : 'text-destructive')
          }
        >
          {d}
        </span>
      ) : null}
    </div>
  );
}

function RecentAutomationsCard({
  onSeeAll,
  onOpen,
}: {
  onSeeAll: () => void;
  onOpen: (flowId: string) => void;
}) {
  // Most-recently-touched flows for this project (server returns them updated-desc).
  const { data: flowsPage, isLoading } = flowHooks.useFlows({
    limit: 5,
    cursor: undefined,
  });
  const flows = flowsPage?.data ?? [];

  return (
    <Card
      cap={t('Recent automations')}
      action={
        <button
          type="button"
          onClick={onSeeAll}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t('View all →')}
        </button>
      }
    >
      {isLoading ? (
        <div className="-mx-1 flex flex-col">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2.5">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Icon3d name="automation" size={40} />
          <p className="text-sm font-semibold">{t('No automations yet')}</p>
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t('Create your first automation →')}
          </button>
        </div>
      ) : (
        <div className="-mx-1 flex flex-col">
          {flows.map((flow) => (
            <button
              type="button"
              key={flow.id}
              onClick={() => onOpen(flow.id)}
              className="flex items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-muted/50 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/60"
            >
              <Icon3d name="automation" size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {flow.version.displayName}
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  {t('Updated')}{' '}
                  {formatUtils.formatDateToAgo(new Date(flow.updated))}
                </div>
              </div>
              <StatusPill
                status={flow.status === FlowStatus.ENABLED ? 'on' : 'off'}
                className="ml-auto"
              />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatusPill({
  status,
  className,
}: {
  status: 'on' | 'off' | 'err';
  className?: string;
}) {
  const map = {
    on: { c: 'bg-success/15 text-success', label: t('Active') },
    off: { c: 'bg-warning/20 text-warning', label: t('Paused') },
    err: { c: 'bg-destructive/15 text-destructive', label: t('Failed') },
  }[status];
  return (
    <span
      className={
        'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ' +
        map.c +
        ' ' +
        (className ?? '')
      }
    >
      ● {map.label}
    </span>
  );
}

function NeedsAttentionCard({
  navigate,
  failedRuns,
  pendingInvites,
  needReconnect,
}: {
  navigate: (to: string) => void;
  failedRuns: number;
  pendingInvites: number;
  needReconnect: number;
}) {
  const hasAny = failedRuns > 0 || pendingInvites > 0 || needReconnect > 0;
  return (
    <Card cap={t('Needs attention')}>
      {failedRuns > 0 && (
        <Alert
          tone="danger"
          onClick={() => navigate('/operate/runs')}
          text={t('{n} runs failed in the last 7 days. Review and retry.', {
            n: failedRuns,
          })}
        />
      )}
      {needReconnect > 0 && (
        <Alert
          tone="warn"
          onClick={() => navigate('/connect/connections')}
          text={t('{n} connections need re-authentication.', {
            n: needReconnect,
          })}
        />
      )}
      {pendingInvites > 0 && (
        <Alert
          tone="info"
          onClick={() => navigate('/admin/users')}
          text={t('{n} pending invitations awaiting acceptance.', {
            n: pendingInvites,
          })}
        />
      )}
      {!hasAny && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Icon3d name="impact" size={40} />
          <p className="text-sm font-semibold">{t("You're all caught up")}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {t('No failed runs, broken connections or pending invites.')}
          </p>
        </div>
      )}
    </Card>
  );
}

function Alert({
  tone,
  text,
  onClick,
}: {
  tone: 'danger' | 'warn' | 'info';
  text: string;
  onClick: () => void;
}) {
  const map = {
    danger: {
      wrap: 'bg-destructive/10 border-destructive/20 hover:bg-destructive/15',
      stripe: 'bg-destructive',
      dot: 'text-destructive',
    },
    warn: {
      wrap: 'bg-warning/12 border-warning/25 hover:bg-warning/18',
      stripe: 'bg-warning',
      dot: 'text-warning',
    },
    info: {
      wrap: 'bg-secondary/10 border-secondary/20 hover:bg-secondary/15',
      stripe: 'bg-secondary',
      dot: 'text-secondary',
    },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group relative mb-2.5 flex w-full items-start gap-2.5 overflow-hidden rounded-xl border p-3 pl-3.5 text-left transition-colors last:mb-0 ' +
        map.wrap
      }
    >
      <span
        className={'absolute inset-y-0 left-0 w-1 ' + map.stripe}
        aria-hidden
      />
      <span className={'mt-0.5 text-[13px] leading-none ' + map.dot}>●</span>
      <span className="text-[12.5px] leading-snug text-foreground">{text}</span>
    </button>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | null;
  hint: string;
  icon: string;
}) {
  return (
    <Card cap={label}>
      <div className="flex items-center gap-3">
        <Icon3d name={icon} size={34} />
        <div className="flex flex-col gap-1">
          {value === null ? (
            <Skeleton className="h-6 w-14" />
          ) : (
            <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
              {value}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      </div>
    </Card>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
}

export default OverhaulHomePage;
