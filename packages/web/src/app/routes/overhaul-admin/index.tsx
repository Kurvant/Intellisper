import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { Error, Success } from '@/features/billing';

import { OverhaulAdminShell } from './admin-shell';

/**
 * Overhaul Admin routes (/admin/**) — the additive, NewAppShell-hosted counterpart of the legacy
 * platform-routes (/platform/**). Every admin page is mounted VERBATIM (the exact same lazy page
 * components the old routes use) inside OverhaulAdminShell, which reproduces the platform-admin
 * gate and hosts the Admin settings sub-nav. No page component is modified; the old /platform/**
 * routes stay live and untouched. Per-page gates (LockedFeatureGuard / edition / permission /
 * embed) remain inside each page.
 */

// Reuse the EXACT same lazy page modules the legacy platform-routes import.
const SettingsBilling = React.lazy(() => import('../platform/billing'));
const EventDestinationsPage = React.lazy(
  () => import('../platform/infra/event-destinations'),
);
const SettingsHealthPage = React.lazy(() => import('../platform/infra/health'));
const ChatAnalyticsPage = React.lazy(
  () => import('../platform/infra/chat-analytics'),
);
const AiSpendPage = React.lazy(() => import('../platform/ai-spend'));
const AgentActivityPage = React.lazy(
  () => import('../platform/agent-activity'),
);
const AdminMemoryPage = React.lazy(() => import('./memory'));
const TriggerHealthPage = React.lazy(
  () => import('../platform/infra/triggers'),
);
const SettingsWorkersPage = React.lazy(
  () => import('../platform/infra/workers'),
);
const ProjectsPage = React.lazy(() => import('../platform/projects'));
const ApiKeysPage = React.lazy(() =>
  import('../platform/security/api-keys').then((m) => ({
    default: m.ApiKeysPage,
  })),
);
const AuditLogsPage = React.lazy(
  () => import('../platform/security/audit-logs'),
);
const ProjectRolePage = React.lazy(() =>
  import('../platform/security/project-role').then((m) => ({
    default: m.ProjectRolePage,
  })),
);
const SecretManagersPage = React.lazy(
  () => import('../platform/security/secret-managers'),
);
const EmbedPage = React.lazy(() =>
  import('../platform/security/embed').then((m) => ({
    default: m.EmbedPage,
  })),
);
const SSOPage = React.lazy(() =>
  import('../platform/security/sso').then((m) => ({ default: m.SSOPage })),
);
const AIProvidersPage = React.lazy(() => import('../platform/setup/ai'));
const PlatformMcpPage = React.lazy(() => import('../platform/setup/mcp'));
const BrandingPage = React.lazy(() =>
  import('../platform/setup/branding').then((m) => ({
    default: m.BrandingPage,
  })),
);
const GlobalConnectionsTable = React.lazy(() =>
  import('../platform/setup/connections').then((m) => ({
    default: m.GlobalConnectionsTable,
  })),
);
const PlatformBlocksPage = React.lazy(() =>
  import('../platform/setup/pieces').then((m) => ({
    default: m.PlatformBlocksPage,
  })),
);
const PlatformTemplatesPage = React.lazy(() =>
  import('../platform/setup/templates').then((m) => ({
    default: m.PlatformTemplatesPage,
  })),
);
const UsersPage = React.lazy(() => import('../platform/users'));
const PlatformConnectionsPage = React.lazy(
  () => import('../platform/connections'),
);

/**
 * Mount an admin page inside the overhaul admin shell with a page-title, matching the (title, page)
 * pairing of the old /platform/** routes.
 */
function adminPage(
  title: string,
  page: React.ReactElement,
  variant: 'default' | 'list' = 'default',
) {
  // Every admin page opts into its `variant="overhaul"` presentation so it drops its OWN in-page
  // header/centering (the title/subtitle now live in the shell top bar) while keeping its actions.
  // Pages that don't yet accept `variant` simply ignore the extra prop — harmless.
  const overhaulPage = React.cloneElement(
    page as React.ReactElement<{ variant?: 'default' | 'overhaul' }>,
    { variant: 'overhaul' },
  );
  return (
    <OverhaulAdminShell title={title} variant={variant}>
      <PageTitle title={title}>
        <Suspense fallback={<RouteLoadingBar />}>{overhaulPage}</Suspense>
      </PageTitle>
    </OverhaulAdminShell>
  );
}

export const overhaulAdminRoutes = [
  // Landing → Projects (mirrors /platform → /platform/projects).
  {
    path: '/admin',
    element: (
      <OverhaulAdminShell title="Platform">
        <PageTitle title="Platform">
          <Navigate to="/admin/projects" replace />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  {
    path: '/admin/projects',
    element: adminPage('Projects', <ProjectsPage />, 'list'),
  },
  { path: '/admin/users', element: adminPage('Users', <UsersPage />, 'list') },
  {
    path: '/admin/connections',
    element: adminPage('Connections', <PlatformConnectionsPage />, 'list'),
  },
  // Setup
  {
    path: '/admin/setup',
    element: (
      <OverhaulAdminShell title="Platform Setup">
        <PageTitle title="Platform Setup">
          <Navigate to="/admin/setup/ai" replace />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  {
    path: '/admin/setup/ai',
    element: adminPage('AI', <AIProvidersPage />),
  },
  {
    path: '/admin/setup/mcp',
    element: adminPage('MCP Server', <PlatformMcpPage />),
  },
  {
    path: '/admin/setup/pieces',
    element: adminPage('Blocks', <PlatformBlocksPage />),
  },
  {
    path: '/admin/setup/connections',
    element: adminPage('Connections', <GlobalConnectionsTable />, 'list'),
  },
  {
    path: '/admin/setup/templates',
    element: adminPage('Templates', <PlatformTemplatesPage />),
  },
  {
    path: '/admin/setup/branding',
    element: adminPage('Branding', <BrandingPage />),
  },
  {
    path: '/admin/setup/billing',
    element: adminPage('Billing', <SettingsBilling />),
  },
  {
    path: '/admin/setup/billing/success',
    element: (
      <OverhaulAdminShell title="Billing">
        <PageTitle title="Billing">
          <Success />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  {
    path: '/admin/setup/billing/error',
    element: (
      <OverhaulAdminShell title="Billing">
        <PageTitle title="Billing">
          <Error />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  // Security
  {
    path: '/admin/security',
    element: (
      <OverhaulAdminShell title="Platform Security">
        <PageTitle title="Platform Security">
          <Navigate to="/admin/security/audit-logs" replace />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  {
    path: '/admin/security/api-keys',
    element: adminPage('API Keys', <ApiKeysPage />, 'list'),
  },
  {
    path: '/admin/security/secret-managers',
    element: adminPage('Secret managers', <SecretManagersPage />, 'list'),
  },
  {
    path: '/admin/security/audit-logs',
    element: adminPage('Audit Logs', <AuditLogsPage />, 'list'),
  },
  {
    path: '/admin/security/embed',
    element: adminPage('Embedding', <EmbedPage />),
  },
  {
    path: '/admin/security/sso',
    element: adminPage('SSO', <SSOPage />),
  },
  {
    path: '/admin/security/project-roles',
    element: adminPage('Project Roles', <ProjectRolePage />, 'list'),
  },
  // Infrastructure
  {
    path: '/admin/infrastructure',
    element: (
      <OverhaulAdminShell title="Platform Infrastructure">
        <PageTitle title="Platform Infrastructure">
          <Navigate to="/admin/infrastructure/workers" replace />
        </PageTitle>
      </OverhaulAdminShell>
    ),
  },
  {
    path: '/admin/infrastructure/workers',
    element: adminPage('Workers', <SettingsWorkersPage />),
  },
  {
    path: '/admin/infrastructure/health',
    element: adminPage('Health', <SettingsHealthPage />),
  },
  {
    path: '/admin/infrastructure/triggers',
    element: adminPage('Trigger Health', <TriggerHealthPage />),
  },
  {
    path: '/admin/infrastructure/event-destinations',
    element: adminPage('Event Streaming', <EventDestinationsPage />),
  },
  // Observability
  {
    path: '/admin/observability/chat-analytics',
    element: adminPage('Chat Analytics', <ChatAnalyticsPage />),
  },
  {
    path: '/admin/observability/ai-spend',
    element: adminPage('AI Spend', <AiSpendPage />),
  },
  {
    path: '/admin/observability/agent-activity',
    element: adminPage('Agent Activity', <AgentActivityPage />),
  },
  {
    path: '/admin/observability/memory',
    element: adminPage('Memory', <AdminMemoryPage />),
  },
];
