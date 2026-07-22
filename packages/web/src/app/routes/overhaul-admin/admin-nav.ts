import { IbEdition, TeamProjectsLimit } from '@intelblocks/shared';

/**
 * The Admin domain's own settings sub-navigation, ported 1:1 from the legacy PlatformSidebar
 * (components/sidebar/platform). It preserves the EXACT same groups, order, routes, and plan/edition
 * "locked" gating — only the routes are repointed from /platform/** to the additive /admin/** shell
 * and the icons swapped to the overhaul 3D icon registry. The old PlatformSidebar + /platform/**
 * routes stay live and untouched.
 *
 * Locking is data-driven here (see lockedFor) and evaluated by the shell against the live platform
 * plan/edition — identical to how PlatformSidebar computed `locked`. Nothing is newly gated or
 * un-gated; presentation changed, capabilities did not.
 */
export type AdminNavItem = {
  /** Overhaul 3D icon registry name (see components/icons-3d). */
  icon: string;
  label: string;
  /** New /admin/** route (mirrors the old /platform/** route). */
  to: string;
  /**
   * Which plan flag / edition condition locks this item (shows a lock, same as PlatformSidebar).
   * Evaluated by the shell against the live platform + edition.
   */
  lockedFor?: (ctx: {
    plan: Record<string, unknown>;
    edition: IbEdition | undefined;
  }) => boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'General',
    items: [
      {
        icon: 'project',
        label: 'Projects',
        to: '/admin/projects',
        lockedFor: ({ plan }) =>
          plan.teamProjectsLimit === TeamProjectsLimit.NONE,
      },
      { icon: 'user', label: 'Users', to: '/admin/users' },
      { icon: 'connection', label: 'Connections', to: '/admin/connections' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { icon: 'ai-providers', label: 'AI Providers', to: '/admin/setup/ai' },
      { icon: 'mcp', label: 'MCP Server', to: '/admin/setup/mcp' },
      {
        icon: 'branding',
        label: 'Branding',
        to: '/admin/setup/branding',
        lockedFor: ({ plan }) => !plan.customAppearanceEnabled,
      },
      {
        icon: 'global-connection',
        label: 'Global Connections',
        to: '/admin/setup/connections',
        lockedFor: ({ plan }) => !plan.globalConnectionsEnabled,
      },
      {
        icon: 'block',
        label: 'Blocks',
        to: '/admin/setup/pieces',
        lockedFor: ({ plan }) => !plan.manageBlocksEnabled,
      },
      {
        icon: 'template',
        label: 'Templates',
        to: '/admin/setup/templates',
        lockedFor: ({ plan }) => !plan.manageTemplatesEnabled,
      },
      {
        icon: 'billing',
        label: 'Billing',
        to: '/admin/setup/billing',
        lockedFor: ({ edition }) => edition === IbEdition.COMMUNITY,
      },
      {
        icon: 'embed',
        label: 'Embedding',
        to: '/admin/security/embed',
        lockedFor: ({ plan }) => !plan.embeddingEnabled,
      },
    ],
  },
  {
    label: 'Security',
    items: [
      {
        icon: 'sso',
        label: 'Single Sign On',
        to: '/admin/security/sso',
        lockedFor: ({ plan }) => !plan.ssoEnabled,
      },
      {
        icon: 'roles',
        label: 'Project Roles',
        to: '/admin/security/project-roles',
        lockedFor: ({ plan }) => !plan.projectRolesEnabled,
      },
      {
        icon: 'api-key',
        label: 'API Keys',
        to: '/admin/security/api-keys',
        lockedFor: ({ plan }) => !plan.apiKeysEnabled,
      },
      {
        icon: 'secret',
        label: 'Secret Managers',
        to: '/admin/security/secret-managers',
        lockedFor: ({ plan }) => !plan.secretManagersEnabled,
      },
    ],
  },
  {
    label: 'Observability',
    items: [
      {
        icon: 'audit',
        label: 'Audit Logs',
        to: '/admin/security/audit-logs',
        lockedFor: ({ plan }) => !plan.auditLogEnabled,
      },
      {
        icon: 'event-stream',
        label: 'Event Streaming',
        to: '/admin/infrastructure/event-destinations',
        lockedFor: ({ plan }) => !plan.eventStreamingEnabled,
      },
      {
        icon: 'analytics',
        label: 'Chat Analytics',
        to: '/admin/observability/chat-analytics',
      },
      {
        icon: 'analytics',
        label: 'AI Spend',
        to: '/admin/observability/ai-spend',
      },
      {
        icon: 'ai-agent',
        label: 'Agent Activity',
        to: '/admin/observability/agent-activity',
        lockedFor: ({ plan }) => !plan.browserAgentEnabled,
      },
      {
        icon: 'memory-shared',
        label: 'Memory',
        to: '/admin/observability/memory',
        // Not locked on the agent door: memory governance applies to a Studio-only platform's org
        // and flow memory just as much as to an agent platform's personal memory.
      },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        icon: 'workers',
        label: 'Workers',
        to: '/admin/infrastructure/workers',
      },
      { icon: 'health', label: 'Health', to: '/admin/infrastructure/health' },
      {
        icon: 'trigger-health',
        label: 'Triggers',
        to: '/admin/infrastructure/triggers',
      },
    ],
  },
];
