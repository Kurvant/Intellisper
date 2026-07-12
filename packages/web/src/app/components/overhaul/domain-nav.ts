import { Permission } from '@intelblocks/shared';

/**
 * The new domain-grouped navigation model (overhaul IA — see
 * docs/rewrite/frontend-overhaul-IA-map.md). Each item maps to an existing route (so nothing
 * is orphaned) and carries the 3D icon name + the gate that governs its visibility.
 *
 * Gating is NOT re-implemented here — items expose the permission/flag they need, and the shell
 * filters them through the real authorization/flag/embed hooks (same gates as today's sidebars).
 */
export type DomainNavItem = {
  /** 3D icon registry name (see components/icons-3d). */
  icon: string;
  label: string;
  /** Existing route this item navigates to (old routes still work; redirects added later). */
  to: string;
  /** Optional permission required to see the item (checked via useAuthorization). */
  permission?: Permission;
  /** Optional plan flag key on platform.plan.* that, when false, shows a lock. */
  planFlag?: string;
  /** True if this item is platform-admin only. */
  adminOnly?: boolean;
  /** Hidden entirely in embed mode. */
  hideInEmbed?: boolean;
  /** A "Beta"/"New" style chip. */
  badge?: string;
};

export type DomainNavGroup = {
  key: string;
  /** Group heading (also a 3D domain icon name for the collapsed rail). */
  label: string;
  icon: string;
  items: DomainNavItem[];
};

export const DOMAIN_NAV: DomainNavGroup[] = [
  {
    key: 'build',
    label: 'Build',
    icon: 'build',
    items: [
      {
        icon: 'automation',
        label: 'Automations',
        to: '/automations',
        permission: Permission.READ_FLOW,
      },
      { icon: 'template', label: 'Explore templates', to: '/templates' },
      {
        icon: 'variable',
        label: 'Variables',
        to: '/variables',
        permission: Permission.READ_VARIABLE,
      },
    ],
  },
  {
    key: 'operate',
    label: 'Operate',
    icon: 'operate',
    items: [
      {
        icon: 'run',
        label: 'Runs',
        to: '/runs',
        permission: Permission.READ_RUN,
      },
    ],
  },
  {
    key: 'data',
    label: 'Data',
    icon: 'data',
    items: [
      {
        icon: 'table',
        label: 'Tables',
        to: '/automations',
        permission: Permission.READ_TABLE,
      },
    ],
  },
  {
    key: 'connect',
    label: 'Connect',
    icon: 'connect',
    items: [
      {
        icon: 'connection',
        label: 'Connections',
        to: '/connections',
        permission: Permission.READ_APP_CONNECTION,
      },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    icon: 'insights',
    items: [
      {
        icon: 'impact',
        label: 'Impact',
        to: '/impact',
        planFlag: 'analyticsEnabled',
      },
      {
        icon: 'leaderboard',
        label: 'Leaderboard',
        to: '/leaderboard',
        planFlag: 'analyticsEnabled',
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: 'admin',
    items: [
      {
        icon: 'admin',
        label: 'Platform settings',
        to: '/platform',
        adminOnly: true,
        hideInEmbed: true,
      },
    ],
  },
];
