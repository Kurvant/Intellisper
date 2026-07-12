import { t } from 'i18next';
import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Icon3d } from '@/components/icons-3d';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import {
  useAuthorization,
  useIsPlatformAdmin,
} from '@/hooks/authorization-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { cn } from '@/lib/utils';

import { GlobalSearchCommand } from '../global-search/global-search-command';
import { GlobalSearchProvider } from '../global-search/global-search-context';
import { AppSidebarHeader } from '../sidebar/sidebar-header';
import { SidebarUser } from '../sidebar/sidebar-user';

import { DOMAIN_NAV, DomainNavItem } from './domain-nav';

/**
 * Overhaul app shell (Pillar 3b): domain-grouped left rail + sticky topbar. ADDITIVE — this does
 * not replace the existing ProjectDashboardLayout; it is mounted on new overhaul routes so the
 * current app keeps working while the new direction is verified surface-by-surface.
 *
 * Reuses the real shell pieces (search, user menu, gating hooks) so shell capabilities are
 * preserved, not reinvented. Icons come from the 3D set.
 */
export function NewAppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { embedState } = useEmbedding();

  return (
    // The reused shell pieces (AppSidebarHeader, SidebarUser) consume the shadcn sidebar
    // context, so the shell must live inside a SidebarProvider. defaultOpen keeps the rail
    // in its expanded state (our rail is a fixed-width expanded nav, not collapsible-to-icon).
    <SidebarProvider
      open
      onOpenChange={() => undefined}
      className="flex h-screen w-full overflow-hidden bg-background"
      style={{ '--sidebar-width': '236px' } as React.CSSProperties}
    >
      {/* GlobalSearchProvider powers the ⌘K command palette used by the rail's search button
          (SHL-04..08). Reused verbatim so search parity is preserved, not reinvented. */}
      <GlobalSearchProvider>
        {!embedState.hideSideNav && <DomainRail />}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!embedState.hidePageHeader && (
            <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border/70 bg-background/70 px-7 py-3.5 backdrop-blur-xl">
              <div className="min-w-0">
                <h1 className="truncate text-[19px] font-bold tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="truncate text-[12.5px] text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">{actions}</div>
            </header>
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

function DomainRail() {
  const isPlatformAdmin = useIsPlatformAdmin();
  const { checkAccess } = useAuthorization();
  const { embedState } = useEmbedding();
  const { platform } = platformHooks.useCurrentPlatform();

  const isItemVisible = (item: DomainNavItem): boolean => {
    if (item.hideInEmbed && embedState.isEmbedded) return false;
    if (item.adminOnly && !isPlatformAdmin) return false;
    if (item.permission && !checkAccess(item.permission)) return false;
    return true;
  };

  const isItemLocked = (item: DomainNavItem): boolean => {
    if (!item.planFlag) return false;
    const plan = platform?.plan as Record<string, unknown> | undefined;
    return plan ? plan[item.planFlag] === false : false;
  };

  return (
    <nav className="flex w-[236px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/70 bg-sidebar px-3 py-3">
      <div className="px-1 pb-1.5">
        <AppSidebarHeader />
      </div>
      <div className="pb-1">
        <GlobalSearchCommand />
      </div>

      {DOMAIN_NAV.map((group) => {
        const visibleItems = group.items.filter(isItemVisible);
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.key} className="pt-2.5">
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <Icon3d name={group.icon} size={15} />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                {t(group.label)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {visibleItems.map((item) => (
                <RailItem
                  key={item.label}
                  item={item}
                  locked={isItemLocked(item)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-auto border-t border-border pt-2">
        <SidebarUser />
      </div>
    </nav>
  );
}

function RailItem({ item, locked }: { item: DomainNavItem; locked: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.startsWith(item.to) && item.to !== '/';

  return (
    <Button
      variant="ghost"
      onClick={() => navigate(item.to)}
      className={cn(
        'h-auto w-full justify-start gap-2.5 px-2.5 py-2 font-medium text-muted-foreground hover:text-foreground',
        active &&
          'bg-sidebar-accent text-sidebar-primary [&_span]:text-sidebar-primary hover:text-sidebar-primary',
      )}
    >
      <Icon3d name={item.icon} size={20} />
      <span className="truncate text-sm">{t(item.label)}</span>
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
