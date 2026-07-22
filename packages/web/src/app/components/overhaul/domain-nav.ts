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
  /**
   * True if `to` is a bare project-scoped path (e.g. '/build/automations') that must be prefixed
   * with the current project ('/projects/:id') before navigating. Non-scoped items (templates,
   * platform, insights) leave this false and navigate to `to` verbatim.
   */
  projectScoped?: boolean;
  /** Optional permission required to see the item (checked via useAuthorization). */
  permission?: Permission;
  /** Optional plan flag key on platform.plan.* that, when false, shows a lock. */
  planFlag?: string;
  /** True if this item is platform-admin only. */
  adminOnly?: boolean;
  /** Hidden entirely in embed mode. */
  hideInEmbed?: boolean;
  /**
   * Only show when the CURRENT project has releases enabled (project.releasesEnabled). Mirrors the
   * legacy Releases tab's project-level gate, which is distinct from a platform plan flag.
   */
  requiresProjectReleases?: boolean;
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
        icon: 'project',
        label: 'Projects',
        to: '/admin/projects',
        adminOnly: true,
        hideInEmbed: true,
      },
      {
        icon: 'automation',
        label: 'Automations',
        to: '/build/automations',
        projectScoped: true,
        permission: Permission.READ_FLOW,
      },
      { icon: 'template', label: 'Explore templates', to: '/build/explore' },
      {
        icon: 'variable',
        label: 'Variables',
        to: '/build/variables',
        projectScoped: true,
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
        to: '/operate/runs',
        projectScoped: true,
        permission: Permission.READ_RUN,
      },
      {
        icon: 'ai-agent',
        label: 'Agent Routines',
        to: '/insights/agent',
        planFlag: 'browserAgentEnabled',
      },
      {
        icon: 'memory',
        label: 'Memory',
        to: '/operate/memory',
        projectScoped: true,
        // Deliberately NOT gated on `browserAgentEnabled`: memory is a cross-product capability, and
        // a Studio-only platform buys it for org/flow memory with no agent. The entry stays visible
        // and the page renders its own upgrade prompt off the API's 402 when the plan excludes
        // memory — a nav lock could not distinguish "no agent" from "agent, but no memory".
      },
      {
        icon: 'package',
        label: 'Releases',
        to: '/operate/releases',
        projectScoped: true,
        permission: Permission.READ_PROJECT_RELEASE,
        requiresProjectReleases: true,
        hideInEmbed: true,
      },
    ],
  },
  {
    key: 'data',
    label: 'Data',
    icon: 'data',
    items: [
      {
        // Tables have no standalone list in this app — they are browsed inside the (overhaul)
        // Automations gallery alongside flows/folders — so the nav item lands there. Opening a
        // table navigates to the project-scoped editor at /data/tables/:tableId (OverhaulTablesPage).
        icon: 'table',
        label: 'Tables',
        to: '/build/automations',
        projectScoped: true,
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
        to: '/connect/connections',
        projectScoped: true,
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
        to: '/insights/impact',
        planFlag: 'analyticsEnabled',
      },
      {
        icon: 'leaderboard',
        label: 'Leaderboard',
        to: '/insights/leaderboard',
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
        to: '/admin',
        adminOnly: true,
        hideInEmbed: true,
      },
    ],
  },
];
