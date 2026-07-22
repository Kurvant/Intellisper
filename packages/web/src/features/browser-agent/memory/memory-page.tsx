import {
  AgentMemoryScope,
  MemoryFactKind,
  MemoryVisibility,
} from '@intelblocks/shared';
import { t } from 'i18next';
import {
  Brain,
  Building2,
  Download,
  Plus,
  Search,
  Trash2,
  User2,
  Workflow,
} from 'lucide-react';
import React from 'react';

import { Icon3d } from '@/components/icons-3d/icon-3d';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { MemoryFactCard } from './memory-fact-card';
import {
  isPaymentRequired,
  useBulkDeleteMemory,
  useCreateFact,
  useDeleteFact,
  useExportMemory,
  useMemoryFacts,
  useMemorySettings,
  useSetFactVisibility,
  useUpdateFact,
  useUpdateMemorySettings,
} from './memory-hooks';
import { MemorySettingsCard } from './memory-settings-card';

const KINDS: MemoryFactKind[] = [
  MemoryFactKind.PREFERENCE,
  MemoryFactKind.PROJECT,
  MemoryFactKind.TASK,
  MemoryFactKind.CONTACT,
  MemoryFactKind.NOTE,
];

/**
 * Copy per scope. Each tab is a different audience, and the page says so plainly.
 *
 * Every string is wrapped in `t()` AT THE CALL SITE (inside a getter), never stored pre-translated:
 * a module-level constant would be evaluated once at import time and then never re-translate when
 * the user switches language. Literal keys also keep the strings statically visible to the i18n
 * extractor — `t(someVariable)` would be invisible to it and silently untranslatable.
 */
const SCOPE_COPY: Record<
  string,
  {
    title: () => string;
    blurb: () => string;
    empty: () => string;
    icon: React.ReactNode;
  }
> = {
  [AgentMemoryScope.USER]: {
    title: () => t('My memory'),
    blurb: () =>
      t(
        'What your Intellisper agent remembers about you. Only you can see this.',
      ),
    empty: () =>
      t(
        'Nothing remembered yet. Your agent will save useful facts as you work — or add one yourself.',
      ),
    icon: <User2 className="size-3.5" />,
  },
  [AgentMemoryScope.PLATFORM]: {
    title: () => t('Org memory'),
    blurb: () =>
      t(
        'Shared team knowledge your flows and agents can draw on. Everyone in this org can see and curate it.',
      ),
    empty: () =>
      t(
        'No org memory yet. Add facts your whole team benefits from — tone of voice, key accounts, house rules.',
      ),
    icon: <Building2 className="size-3.5" />,
  },
  [AgentMemoryScope.FLOW]: {
    title: () => t('Flow memory'),
    blurb: () =>
      t(
        'What this flow has learned across its runs. Scoped to the flow, visible to your org.',
      ),
    empty: () => t('This flow has not learned anything yet.'),
    icon: <Workflow className="size-3.5" />,
  },
};

/**
 * Copy for a solo platform, where "my memory" and "the org's memory" are the same person's. It says
 * plainly that this memory is what the agent AND the flows use, because that is the thing a solo
 * user actually needs to know — and it is exactly what the tab split used to obscure.
 */
const SOLO_COPY = {
  blurb: () =>
    t(
      'What Intellisper remembers for you — used by your agent and available to your flows. Only you can see it.',
    ),
  empty: () =>
    t(
      'Nothing remembered yet. Facts saved here are available to your agent and your flows — add one, or let your agent save what it learns.',
    ),
};

type MemoryPageProps = {
  projectId: string;
  /**
   * Which scopes this surface offers. Intellisper Agent shows personal + org; a flow's own memory
   * panel passes only FLOW with its flowId.
   */
  scopes?: AgentMemoryScope[];
  flowId?: string;
};

/** The paid-feature upsell. Shown when the API answers 402 — memory is not on this plan. */
const MemoryUpsell = () => (
  <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
    <Icon3d name="memory" size={64} />
    <div className="max-w-[480px] space-y-2">
      <h2 className="text-xl font-semibold">{t('Add memory')}</h2>
      {/* Product-neutral copy: memory is sold to Studio-only customers too, so this must read
          sensibly for someone who has flows and no browser agent. */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t(
          'On your current plan, every task starts from scratch. Upgrade to let your agent and your flows remember preferences, projects and team knowledge — so nobody repeats themselves and your automations get sharper the more you use them.',
        )}
      </p>
    </div>
    <Button asChild>
      <a href="/plans">{t('See plans')}</a>
    </Button>
  </Card>
);

const AddMemoryDialog = ({
  onAdd,
  scope,
}: {
  onAdd: (content: string, kind: MemoryFactKind) => void;
  scope: AgentMemoryScope;
}) => {
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState('');
  const [kind, setKind] = React.useState<MemoryFactKind>(MemoryFactKind.NOTE);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onAdd(trimmed, kind);
    setContent('');
    setKind(MemoryFactKind.NOTE);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          {t('Add memory')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {scope === AgentMemoryScope.USER
              ? t('Remember something about me')
              : t('Add to org memory')}
          </DialogTitle>
          <DialogDescription>
            {scope === AgentMemoryScope.USER
              ? t(
                  'Your agent will use this to personalise its help. It stays private to you unless you choose to share it.',
                )
              : t('Everyone in this org can see and use this fact.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Textarea
            autoFocus
            rows={4}
            placeholder={t(
              'e.g. I prefer concise answers and British spelling.',
            )}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="resize-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('Type')}</span>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as MemoryFactKind)}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t(
              'Never add passwords, cards or tokens — they are refused automatically.',
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={!content.trim()}>
            {t('Save to memory')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ClearAllDialog = ({
  scope,
  onConfirm,
}: {
  scope: AgentMemoryScope;
  onConfirm: () => void;
}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          <Trash2 className="mr-1.5 size-3.5" />
          {t('Clear all')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('Forget everything?')}</DialogTitle>
          <DialogDescription>
            {scope === AgentMemoryScope.USER
              ? t(
                  'This forgets every fact your agent has saved about you. It cannot be undone from here.',
                )
              : t(
                  'This forgets every fact in this shared memory, for everyone in the org. It cannot be undone from here.',
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {t('Forget everything')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The member-facing memory surface, shared by Intellisper Agent and Studio. The tab selects the
 * audience (mine / org / this flow); everything else — search, add, edit, share, forget — works the
 * same way in each, so there is one thing to learn.
 */
export const MemoryPage = ({
  projectId,
  scopes = [AgentMemoryScope.USER, AgentMemoryScope.PLATFORM],
  flowId,
}: MemoryPageProps) => {
  const [scope, setScope] = React.useState<AgentMemoryScope>(scopes[0]);
  const [search, setSearch] = React.useState('');
  const [kind, setKind] = React.useState<MemoryFactKind | 'ALL'>('ALL');

  const settingsQuery = useMemorySettings(projectId);

  /**
   * A solo platform (one member) is its own org, so "My memory" vs "Org memory" is a distinction
   * without a difference — and picking the wrong side has a real consequence: only PLATFORM-scoped
   * facts are visible to their flows. So a solo user gets ONE merged view whose writes default to
   * PLATFORM.
   *
   * This only affects LAYOUT and the write-time DEFAULT. It never re-scopes a stored fact: existing
   * USER facts stay personal, and if this platform later gains a second member the tabs simply
   * appear — nothing silently changes audience. See MemorySettingsResponse.soloPlatform.
   */
  const isSolo = settingsQuery.data?.soloPlatform === true;
  const offersUserTab = scopes.includes(AgentMemoryScope.USER);
  const effectiveScopes = isSolo
    ? scopes.filter((s) => s !== AgentMemoryScope.USER)
    : scopes;
  const activeScope =
    isSolo && scope === AgentMemoryScope.USER
      ? effectiveScopes[0] ?? AgentMemoryScope.PLATFORM
      : scope;

  const listParams = {
    projectId,
    scope: activeScope,
    flowId: activeScope === AgentMemoryScope.FLOW ? flowId : undefined,
    search: search.trim() || undefined,
    kind: kind === 'ALL' ? undefined : kind,
    limit: 100,
  };

  const factsQuery = useMemoryFacts(listParams);

  /**
   * A solo platform sees ONE list, but its facts can legitimately live in two scopes: anything the
   * agent captured is USER-scoped, while new writes here default to PLATFORM. Without this second
   * read, a solo user with existing agent-captured facts would open Memory and see an empty page —
   * their memory would look deleted.
   *
   * Merged client-side on purpose: each read stays individually scoped, so the server predicate that
   * enforces ownership is untouched. Only the caller's OWN user facts can come back here.
   */
  const soloUserFactsQuery = useMemoryFacts(
    { ...listParams, scope: AgentMemoryScope.USER, flowId: undefined },
    isSolo && offersUserTab,
  );

  const createFact = useCreateFact(projectId);
  const updateFact = useUpdateFact(projectId);
  const setVisibility = useSetFactVisibility(projectId);
  const deleteFact = useDeleteFact(projectId);
  const bulkDelete = useBulkDeleteMemory(projectId);
  const exportMemory = useExportMemory(projectId);
  const updateSettings = useUpdateMemorySettings(projectId);

  // Memory is a paid capability: the API answers 402 when the plan excludes it.
  if (
    isPaymentRequired(factsQuery.error) ||
    isPaymentRequired(settingsQuery.error)
  ) {
    return <MemoryUpsell />;
  }

  const settings = settingsQuery.data;
  // Newest-first across both scopes, so a solo user sees one coherent timeline rather than two
  // arbitrary blocks. Non-solo platforms merge nothing — the second query never runs.
  const facts = [
    ...(factsQuery.data?.facts ?? []),
    ...(soloUserFactsQuery.data?.facts ?? []),
  ].sort((a, b) => (a.created < b.created ? 1 : -1));
  const totalFacts =
    (factsQuery.data?.total ?? 0) + (soloUserFactsQuery.data?.total ?? 0);
  const copy = isSolo ? SOLO_COPY : SCOPE_COPY[activeScope];

  /**
   * Sharing is only *live* when the admin unlocked it AND the member opted in. The per-fact control
   * still renders otherwise (so the capability is discoverable), but says plainly that nothing is
   * exposed yet.
   */
  const sharingActive = Boolean(
    settings?.adminVisibilityAvailable && settings?.adminVisibilityOptIn,
  );

  return (
    <div className="space-y-5">
      {/* Solo platforms get no tabs — there is only one audience, so a chooser would be noise. */}
      {!isSolo && effectiveScopes.length > 1 && (
        <Tabs
          value={activeScope}
          onValueChange={(v) => setScope(v as AgentMemoryScope)}
        >
          <TabsList>
            {effectiveScopes.map((s) => (
              <TabsTrigger key={s} value={s} className="gap-1.5">
                {SCOPE_COPY[s].icon}
                {SCOPE_COPY[s].title()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <p className="text-sm text-muted-foreground">{copy.blurb()}</p>

      {/* The settings card is about the ACTING USER's own switches (auto-recall/capture, admin
          visibility), so it shows on the personal tab — and on a solo platform's single view, where
          there is no personal tab to put it on. */}
      {(isSolo || activeScope === AgentMemoryScope.USER) && settings && (
        <MemorySettingsCard
          settings={settings}
          disabled={updateSettings.isPending}
          onChange={(patch) => updateSettings.mutate(patch)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search memory…')}
            className="h-9 pl-8 text-sm"
          />
        </div>

        <Select
          value={kind}
          onValueChange={(v) => setKind(v as MemoryFactKind | 'ALL')}
        >
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              {t('All types')}
            </SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* On a solo platform `activeScope` is already PLATFORM, so a new fact is written where the
            user's flows can see it — decided here, at write time, and never applied retroactively to
            facts written earlier. */}
        <AddMemoryDialog
          scope={activeScope}
          onAdd={(content, k) =>
            createFact.mutate({
              content,
              kind: k,
              scope: activeScope,
              flowId:
                activeScope === AgentMemoryScope.FLOW ? flowId : undefined,
            })
          }
        />

        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            exportMemory.mutate({
              scope: activeScope,
              flowId:
                activeScope === AgentMemoryScope.FLOW ? flowId : undefined,
            })
          }
          disabled={!facts.length}
        >
          <Download className="mr-1.5 size-3.5" />
          {t('Export')}
        </Button>

        {facts.length > 0 && (
          <ClearAllDialog
            scope={activeScope}
            onConfirm={() =>
              bulkDelete.mutate({
                scope: activeScope,
                flowId:
                  activeScope === AgentMemoryScope.FLOW ? flowId : undefined,
              })
            }
          />
        )}
      </div>

      {factsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : facts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Icon3d name="memory" size={48} />
          <p className="max-w-[380px] text-sm text-muted-foreground">
            {search.trim()
              ? t('No memories match “{search}”.', { search })
              : copy.empty()}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Brain className="size-3.5" />
            {t('{count, plural, =1 {1 memory} other {# memories}}', {
              count: totalFacts,
            })}
          </div>
          <div className="grid gap-3">
            {facts.map((fact) => (
              <MemoryFactCard
                key={fact.id}
                fact={fact}
                sharingActive={sharingActive}
                onEdit={(content) =>
                  updateFact.mutate({ id: fact.id, content })
                }
                onDelete={() => deleteFact.mutate(fact.id)}
                // Keyed off the FACT's own scope, not the view's: a solo platform's merged list can
                // hold both USER and PLATFORM facts, and only a personal one carries a sharing mark
                // (org/flow memory is team-owned already). On a solo platform the viewer is the only
                // member, so there is nobody to share with — hence the extra `!isSolo`. Existing
                // personal facts keep their marks untouched either way.
                onToggleShare={
                  !isSolo && fact.scope === AgentMemoryScope.USER
                    ? (next: MemoryVisibility) =>
                        setVisibility.mutate({ id: fact.id, visibility: next })
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
