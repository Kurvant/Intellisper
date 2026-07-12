import { t } from 'i18next';
import { useNavigate } from 'react-router-dom';

import { Icon3d } from '@/components/icons-3d';
import { Button } from '@/components/ui/button';
import { userHooks } from '@/hooks/user-hooks';

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

  return (
    <NewAppShell
      title={t('{greeting}, {name}', {
        greeting,
        name: user?.firstName ?? t('there'),
      })}
      subtitle={t("Here's what's happening across your workspace")}
      actions={
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/automations')}
        >
          <span className="text-base leading-none">+</span>
          {t('New')}
        </Button>
      }
    >
      <div className="mx-auto max-w-[1280px] px-7 py-6">
        {/* Hero + run-health */}
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <HeroCard onNewFlow={() => navigate('/automations')} />
          <RunHealthCard onClick={() => navigate('/runs')} />
        </div>

        {/* Recent + needs-attention */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <RecentAutomationsCard onSeeAll={() => navigate('/automations')} />
          <NeedsAttentionCard navigate={navigate} />
        </div>

        {/* Stat tiles */}
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <StatTile
            label={t('Active flows')}
            value="42"
            hint={t('of 50 limit')}
            icon="flow"
          />
          <StatTile
            label={t('Active users')}
            value="18"
            hint={t('across 3 projects')}
            icon="team"
          />
          <StatTile
            label={t('Connections')}
            value="27"
            hint={t('6 need reconnect')}
            icon="connection"
          />
        </div>

        <p className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          {t(
            'Home aggregates existing data (run health, favorites, impact, alerts) into a command center. It adds an entry point and removes nothing — the flows list still lives under Build → Automations.',
          )}
        </p>
      </div>
    </NewAppShell>
  );
}

function HeroCard({ onNewFlow }: { onNewFlow: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 text-white shadow-[0_1px_2px_rgba(16,22,35,.06),0_18px_40px_-20px_rgba(154,82,32,.55)]">
      {/* layered brand gradient + radial sheen for depth (not a flat block) */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,#C4703A_0%,#B5652F_42%,#9A5220_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_12%_0%,rgba(255,220,150,.45)_0%,transparent_45%)]" />
      <div className="pointer-events-none absolute -right-16 -top-16 -z-10 size-64 rounded-full bg-[radial-gradient(circle,rgba(245,184,24,.35)_0%,transparent_70%)]" />
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">
        {t('Command center')}
      </div>
      <h2 className="mt-1.5 text-[23px] font-bold leading-[1.15] tracking-tight text-white [text-wrap:balance]">
        {t('Your automations saved 214 hours this month')}
      </h2>
      <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-white/85">
        {t(
          "42 automations running across 3 projects. Everything's healthy except a few runs that need a retry.",
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

function RunHealthCard({ onClick }: { onClick: () => void }) {
  return (
    <Card cap={t('Run health · last 7 days')}>
      <div className="flex justify-between gap-3">
        <Metric n="8,412" l={t('Runs')} d={t('+12%')} up />
        <Metric n="98.6%" l={t('Success')} d={t('+0.4%')} up />
        <Metric n="3" l={t('Failed')} d={t('needs retry')} />
      </div>
      <div className="mt-3 flex h-12 items-end gap-1.5 border-b border-border/60 pb-px">
        {[40, 55, 48, 70, 62, 88, 75].map((h, i) => (
          <span
            key={i}
            className={
              'flex-1 rounded-md bg-gradient-to-t ' +
              (i === 5
                ? 'from-primary/70 to-primary'
                : 'from-primary/15 to-primary/45')
            }
            style={{ height: `${h}%` }}
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
  d: string;
  up?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
        {n}
      </span>
      <span className="text-xs text-muted-foreground">{l}</span>
      <span
        className={
          'text-[11.5px] font-semibold ' +
          (up ? 'text-success' : 'text-destructive')
        }
      >
        {d}
      </span>
    </div>
  );
}

function RecentAutomationsCard({ onSeeAll }: { onSeeAll: () => void }) {
  const rows = [
    {
      icon: 'automation',
      name: 'Daily sync → Slack',
      meta: t('Ran 2m ago · Acme Ops'),
      status: 'on',
    },
    {
      icon: 'automation',
      name: 'Invoice → QuickBooks',
      meta: t('Ran 1h ago · Finance'),
      status: 'off',
    },
    {
      icon: 'automation',
      name: 'Lead → CRM enrich',
      meta: t('Ran 3h ago · Growth'),
      status: 'err',
    },
    {
      icon: 'table',
      name: 'Customers table',
      meta: t('Edited yesterday · 1,204 rows'),
      status: 'on',
    },
  ] as const;
  return (
    <Card
      cap={t('Recent & favorite automations')}
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
      <div className="-mx-1 flex flex-col">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-muted/50 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/60"
          >
            <Icon3d name={r.icon} size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{r.name}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {r.meta}
              </div>
            </div>
            <StatusPill status={r.status} className="ml-auto" />
          </div>
        ))}
      </div>
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

function NeedsAttentionCard({ navigate }: { navigate: (to: string) => void }) {
  return (
    <Card cap={t('Needs attention')}>
      <Alert
        tone="danger"
        onClick={() => navigate('/runs')}
        text={t(
          '3 runs failed in "Lead → CRM enrich". Retry from failed step or open the run.',
        )}
      />
      <Alert
        tone="warn"
        onClick={() => navigate('/platform/setup/billing')}
        text={t('AI credits at 72%. Auto top-up is off.')}
      />
      <Alert
        tone="info"
        onClick={() => navigate('/platform/users')}
        text={t('2 pending invitations awaiting acceptance.')}
      />
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
  value: string;
  hint: string;
  icon: string;
}) {
  return (
    <Card cap={label}>
      <div className="flex items-center gap-3">
        <Icon3d name={icon} size={34} />
        <div className="flex flex-col">
          <span className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
            {value}
          </span>
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
