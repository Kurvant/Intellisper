import { IbEdition, IbFlagId } from '@intelblocks/shared';
import { t } from 'i18next';
import { ChevronLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Icon3d } from '@/components/icons-3d';
import { Button } from '@/components/ui/button';
import { PurchaseExtraFlowsDialog } from '@/features/billing';
import {
  useAuthorization,
  useIsPlatformAdmin,
} from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { determineDefaultRoute } from '@/lib/route-utils';
import { cn } from '@/lib/utils';

import { AllowOnlyLoggedInUserOnlyGuard } from '../../components/allow-logged-in-user-only-guard';
import { NewAppShell } from '../../components/overhaul/new-app-shell';

import { ADMIN_NAV, AdminNavGroup, AdminNavItem } from './admin-nav';

/**
 * Overhaul Admin (Platform settings) shell — the /admin/** counterpart to the legacy PlatformLayout.
 *
 * It preserves the EXACT same outer gate as PlatformLayout: AllowOnlyLoggedInUserOnlyGuard plus the
 * useIsPlatformAdmin() check that redirects non-admins to "/". It also keeps the CLOUD-only
 * PurchaseExtraFlowsDialog. The presentation is the only thing that changed: instead of the old
 * PlatformSidebar, the Admin domain's settings sub-navigation now lives INSIDE the NewAppShell
 * content area as a light-glass rail, while the outer domain icon-rail + top bar come from
 * NewAppShell. Every per-page gate (LockedFeatureGuard / edition / RoutePermissionGuard / embed)
 * stays inside the page components, untouched.
 */
export function OverhaulAdminShell({
  title,
  variant = 'default',
  children,
}: {
  title: string;
  /**
   * 'list' gives high-traffic DataTable pages (Projects / Users / API Keys / ...) a light-glass
   * content card around the page — chrome polish only. The DataTable itself is never touched.
   */
  variant?: 'default' | 'list';
  children: ReactNode;
}) {
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);
  const isPlatformAdmin = useIsPlatformAdmin();

  return (
    <AllowOnlyLoggedInUserOnlyGuard>
      {isPlatformAdmin ? (
        <NewAppShell
          title={t('Platform settings')}
          subtitle={t(title)}
          hideProjectChrome
        >
          <div className="flex h-full min-h-0">
            <AdminSettingsNav />
            <div className="min-w-0 flex-1 overflow-y-auto">
              {variant === 'list' ? (
                <div className="p-4 md:p-5">
                  <div className="ov-glass ov-slide-in-up rounded-2xl px-4 py-3 md:px-5 md:py-4">
                    {children}
                  </div>
                </div>
              ) : (
                children
              )}
            </div>
          </div>
          {edition === IbEdition.CLOUD && <PurchaseExtraFlowsDialog />}
        </NewAppShell>
      ) : (
        <Navigate to="/" />
      )}
    </AllowOnlyLoggedInUserOnlyGuard>
  );
}

function AdminSettingsNav() {
  const { platform } = platformHooks.useCurrentPlatform();
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);
  const { checkAccess } = useAuthorization();
  const defaultRoute = determineDefaultRoute(checkAccess);

  const plan = (platform?.plan ?? {}) as Record<string, unknown>;
  const isLocked = (item: AdminNavItem) =>
    item.lockedFor
      ? item.lockedFor({ plan, edition: edition ?? undefined })
      : false;

  return (
    <nav className="ov-glass ov-slide-in-left m-3 hidden w-[220px] shrink-0 flex-col overflow-y-auto rounded-2xl p-3 md:flex">
      <Link
        to={defaultRoute}
        className="mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        <span className="truncate">{t('Back to app')}</span>
      </Link>
      {ADMIN_NAV.map((group, gIdx) => (
        <AdminNavGroupBlock
          key={group.label}
          group={group}
          firstGroup={gIdx === 0}
          isLocked={isLocked}
        />
      ))}
    </nav>
  );
}

function AdminNavGroupBlock({
  group,
  firstGroup,
  isLocked,
}: {
  group: AdminNavGroup;
  firstGroup: boolean;
  isLocked: (item: AdminNavItem) => boolean;
}) {
  return (
    <div className={cn(firstGroup ? 'mt-1' : 'mt-3')}>
      <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {t(group.label)}
      </div>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item, i) => (
          <AdminNavLink
            key={item.label}
            item={item}
            index={i}
            locked={isLocked(item)}
          />
        ))}
      </div>
    </div>
  );
}

function AdminNavLink({
  item,
  index,
  locked,
}: {
  item: AdminNavItem;
  index: number;
  locked: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.startsWith(item.to);

  return (
    <Button
      variant="ghost"
      onClick={() => navigate(item.to)}
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(
        'ov-slide-in-left h-auto w-full justify-start gap-2.5 px-2.5 py-2 font-medium text-muted-foreground hover:text-foreground',
        active &&
          'bg-primary/10 text-primary [&_span]:text-primary hover:text-primary',
      )}
    >
      <Icon3d name={item.icon} size={18} />
      <span className="truncate text-[13px]">{t(item.label)}</span>
      {locked && (
        <Icon3d name="secret" size={13} className="ml-auto opacity-60" />
      )}
    </Button>
  );
}
