import { t } from 'i18next';
import { Bell, PanelLeftClose } from 'lucide-react';
import { ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Icon3d } from '@/components/icons-3d';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { projectCollectionUtils } from '@/features/projects';
import {
  useAuthorization,
  useIsPlatformAdmin,
} from '@/hooks/authorization-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { GlobalSearchCommand } from '../global-search/global-search-command';
import { GlobalSearchProvider } from '../global-search/global-search-context';
import { SidebarUser } from '../sidebar/sidebar-user';

import { DOMAIN_NAV, DomainNavGroup, DomainNavItem } from './domain-nav';
import { ProjectChrome } from './project-chrome';
import { ProjectSwitcher } from './project-switcher';

/**
 * Overhaul app shell — the redesigned navigation adopted from the Intellisper design mockups.
 *
 * Nav model (per design): a slim ICON RAIL of domains (Home + Build/Operate/Data/Connect/Insights/
 * Admin) plus a PINNED second-column DRAWER that lists the selected domain's sub-items. The drawer
 * stays open until another domain is picked or it is closed. On top: a minimal top bar carrying only
 * notifications + the user profile.
 *
 * ADDITIVE and capability-preserving: every gate (embed / admin-only / permission / plan-lock) from
 * the previous rail is kept; only the presentation changed. Reused shell pieces (SidebarUser) still
 * live inside SidebarProvider; GlobalSearchProvider is kept for the ⌘K palette parity.
 */
export function NewAppShell({
  title,
  subtitle,
  actions,
  children,
  hideProjectChrome = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Hide the shared project chrome (name + member-count + Add-Members + settings gear) in the top
   * bar. Set by contexts where project-level actions don't apply — e.g. the platform-admin shell,
   * which reuses NewAppShell but is not a project surface. Defaults to shown.
   */
  hideProjectChrome?: boolean;
}) {
  const { embedState } = useEmbedding();
  const showProjectChrome = !hideProjectChrome && !embedState.isEmbedded;

  return (
    <SidebarProvider
      open
      onOpenChange={() => undefined}
      className="flex h-screen w-full overflow-hidden bg-background"
      style={{ '--sidebar-width': '236px' } as React.CSSProperties}
    >
      <GlobalSearchProvider>
        {!embedState.hideSideNav && <DomainNav />}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {/* Minimal top bar — search (⌘K parity) + notifications + user profile. */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-5 backdrop-blur-xl">
            <div className="w-full max-w-sm">
              <GlobalSearchCommand />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {showProjectChrome && (
                <Suspense fallback={null}>
                  <ProjectSwitcher />
                  <ProjectChrome />
                </Suspense>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('Notifications')}
                    className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Bell className="size-[18px]" />
                    <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('Notifications')}</TooltipContent>
              </Tooltip>
              <div className="[&_[data-sidebar=menu-button]]:h-9">
                <SidebarUser />
              </div>
            </div>
          </header>

          {!embedState.hidePageHeader && (
            <div className="flex items-center gap-4 px-7 pb-1 pt-5">
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-bold tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="truncate text-[13px] text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">{actions}</div>
            </div>
          )}
          <main
            id="dashboard-content-container"
            className="relative flex-1 overflow-y-auto"
          >
            {children}
          </main>
        </div>
      </GlobalSearchProvider>
    </SidebarProvider>
  );
}

const DOMAIN_STORAGE_KEY = 'ib.nav.activeDomain';

/**
 * The overhaul navigation (icon rail + pinned drawer). Exported so full-screen surfaces that
 * don't use the whole NewAppShell chrome (e.g. the flow builder / run viewer via BuilderLayout)
 * can still carry the NEW shell's nav instead of the legacy sidebar.
 */
export function DomainNav() {
  const isPlatformAdmin = useIsPlatformAdmin();
  const { checkAccess } = useAuthorization();
  const { embedState } = useEmbedding();
  const { platform } = platformHooks.useCurrentPlatform();
  const { project: currentProject } =
    projectCollectionUtils.useCurrentProject();
  const location = useLocation();

  const isItemVisible = (item: DomainNavItem): boolean => {
    if (item.hideInEmbed && embedState.isEmbedded) return false;
    if (item.adminOnly && !isPlatformAdmin) return false;
    if (item.permission && !checkAccess(item.permission)) return false;
    // Project-level gate (e.g. Releases): only when the current project has the capability enabled.
    if (item.requiresProjectReleases && !currentProject?.releasesEnabled)
      return false;
    return true;
  };

  const isItemLocked = (item: DomainNavItem): boolean => {
    if (!item.planFlag) return false;
    const plan = platform?.plan as Record<string, unknown> | undefined;
    return plan ? plan[item.planFlag] === false : false;
  };

  // Only domains with at least one visible sub-item appear on the rail.
  const visibleGroups = useMemo(
    () =>
      DOMAIN_NAV.map((group) => ({
        group,
        items: group.items.filter(isItemVisible),
      })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isPlatformAdmin,
      embedState.isEmbedded,
      checkAccess,
      currentProject?.releasesEnabled,
    ],
  );

  // Which domain does the current URL belong to? Used to auto-open the right drawer.
  const domainForPath = useMemo(() => {
    for (const { group, items } of visibleGroups) {
      for (const item of items) {
        const target = item.projectScoped
          ? authenticationSession.appendProjectRoutePrefix(item.to)
          : item.to;
        if (
          item.to !== '/' &&
          (location.pathname.startsWith(target) ||
            (item.projectScoped && location.pathname.endsWith(item.to)))
        ) {
          return group.key;
        }
      }
    }
    return null;
  }, [visibleGroups, location.pathname]);

  const [activeDomain, setActiveDomain] = useState<string | null>(() => {
    const stored = localStorage.getItem(DOMAIN_STORAGE_KEY);
    return stored ?? null;
  });

  // Keep the drawer following the active route when it changes (e.g. deep link, ⌘K nav).
  useEffect(() => {
    if (domainForPath) {
      setActiveDomain(domainForPath);
      localStorage.setItem(DOMAIN_STORAGE_KEY, domainForPath);
    }
  }, [domainForPath]);

  const selectDomain = (key: string) => {
    setActiveDomain((prev) => {
      const next = prev === key ? null : key;
      if (next) localStorage.setItem(DOMAIN_STORAGE_KEY, next);
      else localStorage.removeItem(DOMAIN_STORAGE_KEY);
      return next;
    });
  };

  const closeDrawer = () => {
    setActiveDomain(null);
    localStorage.removeItem(DOMAIN_STORAGE_KEY);
  };

  const openGroup = visibleGroups.find((g) => g.group.key === activeDomain);

  return (
    <div className="flex shrink-0">
      {/* Icon rail */}
      <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-sidebar py-4">
        <HomeRailIcon />
        <div className="my-2 h-px w-8 bg-border/70" />
        <div className="flex flex-1 flex-col items-center gap-1">
          {visibleGroups.map(({ group }) => (
            <RailIcon
              key={group.key}
              group={group}
              active={activeDomain === group.key}
              onSelect={() => selectDomain(group.key)}
            />
          ))}
        </div>
      </nav>

      {/* Pinned sub-item drawer */}
      <div
        className={cn(
          'overflow-hidden border-r border-border/60 bg-sidebar/60 backdrop-blur-sm transition-[width,opacity] duration-300 ease-out',
          openGroup ? 'w-[212px] opacity-100' : 'w-0 opacity-0',
        )}
      >
        {openGroup && (
          <div className="flex h-full w-[212px] flex-col px-3 py-4">
            <div className="flex items-center gap-2 px-2 pb-3">
              <Icon3d name={openGroup.group.icon} size={18} />
              <span className="text-[13px] font-bold tracking-tight">
                {t(openGroup.group.label)}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => closeDrawer()}
                    aria-label={t('Collapse menu')}
                    className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t('Collapse menu')}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-col gap-0.5">
              {openGroup.items.map((item, i) => (
                <DrawerItem
                  key={item.label}
                  item={item}
                  index={i}
                  locked={isItemLocked(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeRailIcon() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === '/home';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => navigate('/home')}
          aria-label={t('Home')}
          aria-pressed={active}
          className={cn(
            'grid size-11 place-items-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-foreground',
            active &&
              'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary/15 hover:text-primary',
          )}
        >
          <Icon3d name="home" size={22} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t('Home')}</TooltipContent>
    </Tooltip>
  );
}

function RailIcon({
  group,
  active,
  onSelect,
}: {
  group: DomainNavGroup;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-label={t(group.label)}
          aria-pressed={active}
          className={cn(
            'grid size-11 place-items-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-foreground',
            active &&
              'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary/15 hover:text-primary',
          )}
        >
          <Icon3d name={group.icon} size={22} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t(group.label)}</TooltipContent>
    </Tooltip>
  );
}

function DrawerItem({
  item,
  index,
  locked,
}: {
  item: DomainNavItem;
  index: number;
  locked: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const target = item.projectScoped
    ? authenticationSession.appendProjectRoutePrefix(item.to)
    : item.to;
  const active =
    item.to !== '/' &&
    (location.pathname.startsWith(target) ||
      (item.projectScoped && location.pathname.endsWith(item.to)));

  return (
    <Button
      variant="ghost"
      onClick={() => navigate(target)}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        'ov-slide-in-left h-auto w-full justify-start gap-2.5 px-2.5 py-2 font-medium text-muted-foreground hover:text-foreground',
        active &&
          'bg-sidebar-accent text-sidebar-primary [&_span]:text-sidebar-primary hover:text-sidebar-primary',
      )}
    >
      <Icon3d name={item.icon} size={18} />
      <span className="truncate text-[13px]">{t(item.label)}</span>
      {item.badge && (
        <span className="ml-auto rounded-full bg-secondary/15 px-1.5 text-[10px] font-bold text-secondary">
          {item.badge}
        </span>
      )}
      {locked && (
        <Icon3d name="secret" size={13} className="ml-auto opacity-60" />
      )}
    </Button>
  );
}
