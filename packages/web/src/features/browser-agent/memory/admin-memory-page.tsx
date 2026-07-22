import { AgentMemoryScope } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  Building2,
  Eye,
  Info,
  Lock,
  Search,
  Share2,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import React from 'react';

import { Icon3d } from '@/components/icons-3d/icon-3d';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { MemoryFactCard } from './memory-fact-card';
import {
  useAdminMemoryFacts,
  useAdminMemoryOverview,
  useSetMemorySharing,
} from './memory-hooks';

const StatCard = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </Card>
);

/**
 * Platform-admin memory governance.
 *
 * The page is written to be honest about its own limits, because an admin who misunderstands what
 * they can see is the most expensive kind of mistake here. It shows:
 *   - org (PLATFORM) and flow memory — team-owned knowledge, governed by the admin; and
 *   - member facts ONLY where all three conditions hold (sharing unlocked, member opted in, and the
 *     member marked that specific fact shareable).
 *
 * A member's private fact is not hidden behind a filter here — it is unreachable by construction:
 * the server's single SQL predicate never selects it. The copy says so plainly rather than implying
 * an admin override exists somewhere.
 */
export const AdminMemoryPage = () => {
  const [scope, setScope] = React.useState<AgentMemoryScope | 'ALL'>('ALL');
  const [search, setSearch] = React.useState('');

  const overviewQuery = useAdminMemoryOverview();
  const setSharing = useSetMemorySharing();
  const factsQuery = useAdminMemoryFacts({
    scope: scope === 'ALL' ? undefined : scope,
    search: search.trim() || undefined,
    limit: 100,
  });

  const overview = overviewQuery.data;
  const facts = factsQuery.data?.facts ?? [];

  return (
    <div className="space-y-5">
      {/* The capability switch — the outermost of the three conditions. */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-2 text-muted-foreground">
              {overview?.sharingUnlocked ? (
                <Share2 className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <Label
                htmlFor="admin-memory-sharing"
                className="cursor-pointer text-sm font-medium"
              >
                {t('Allow members to share memory with admins')}
              </Label>
              <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-muted-foreground">
                {t(
                  'Turning this on does not reveal anything by itself. It only lets members choose to opt in — and even then you see only the individual facts each member marks as shareable.',
                )}
              </p>
            </div>
          </div>
          <Switch
            id="admin-memory-sharing"
            checked={overview?.sharingUnlocked ?? false}
            disabled={overviewQuery.isLoading || setSharing.isPending}
            onCheckedChange={(v) => setSharing.mutate(v)}
            className="mt-1 shrink-0"
          />
        </div>

        <Accordion type="single" collapsible className="mt-3">
          <AccordionItem value="rules" className="border-none">
            <AccordionTrigger className="justify-start gap-1 py-1 text-[11px] font-normal text-muted-foreground hover:no-underline">
              <ShieldCheck className="size-3" />
              {t('What can I see, exactly?')}
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-1">
              <ul className="ml-1 list-inside list-disc space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <li>
                  {t(
                    'Org and flow memory: always — it is shared team knowledge, not personal data.',
                  )}
                </li>
                <li>
                  {t(
                    'A member’s personal fact: only when this switch is on, that member opted in, AND they marked that specific fact as shareable. All three, every time.',
                  )}
                </li>
                <li>
                  {t(
                    'Facts a member keeps private are never visible to you — opting in does not hand over their memory, and there is no admin override.',
                  )}
                </li>
                <li>
                  {t(
                    'Turning this off hides every shared fact immediately. Nothing is deleted, and members keep their choices for if you turn it back on.',
                  )}
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      {overviewQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Building2 className="size-3.5" />}
            label={t('Org memory')}
            value={overview?.orgFactCount ?? 0}
            hint={t('Shared team knowledge')}
          />
          <StatCard
            icon={<Workflow className="size-3.5" />}
            label={t('Flow memory')}
            value={overview?.flowFactCount ?? 0}
            hint={t('Learned across flow runs')}
          />
          <StatCard
            icon={<Eye className="size-3.5" />}
            label={t('Shared with you')}
            value={overview?.sharedUserFactCount ?? 0}
            hint={t('Member facts you can see')}
          />
          <StatCard
            icon={<Users className="size-3.5" />}
            label={t('Opted in')}
            value={`${overview?.optedInMemberCount ?? 0}/${
              overview?.memberCount ?? 0
            }`}
            hint={t('Members allowing admin visibility')}
          />
        </div>
      )}

      {overview && !overview.sharingUnlocked && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription className="text-xs">
            {t(
              'Member memory sharing is off, so no personal facts are visible to you — only org and flow memory is listed below.',
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as AgentMemoryScope | 'ALL')}
        >
          <TabsList>
            <TabsTrigger value="ALL">{t('All')}</TabsTrigger>
            <TabsTrigger value={AgentMemoryScope.PLATFORM} className="gap-1.5">
              <Building2 className="size-3.5" />
              {t('Org')}
            </TabsTrigger>
            <TabsTrigger value={AgentMemoryScope.FLOW} className="gap-1.5">
              <Workflow className="size-3.5" />
              {t('Flows')}
            </TabsTrigger>
            <TabsTrigger value={AgentMemoryScope.USER} className="gap-1.5">
              <Share2 className="size-3.5" />
              {t('Shared by members')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search platform memory…')}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {factsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : facts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Icon3d name="memory-shared" size={48} />
          <p className="max-w-[420px] text-sm text-muted-foreground">
            {scope === AgentMemoryScope.USER
              ? t(
                  'No member has shared any personal facts with admins. This is expected — sharing is entirely their choice, per fact.',
                )
              : t('Nothing here yet.')}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {facts.map((fact) => (
            <MemoryFactCard
              key={fact.id}
              fact={fact}
              readOnly
              sharingActive={overview?.sharingUnlocked}
              ownerEmail={fact.ownerEmail}
            />
          ))}
        </div>
      )}
    </div>
  );
};
