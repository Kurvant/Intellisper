import React, { Suspense } from 'react';
import {
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
} from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { authRoutes } from '@/app/routes/auth-routes';
import { overhaulAdminRoutes } from '@/app/routes/overhaul-admin';
import { platformRoutes } from '@/app/routes/platform-routes';
import { projectRoutes } from '@/app/routes/project-routes';
import { publicRoutes } from '@/app/routes/public-routes';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { useEmbedding } from '@/components/providers/embed-provider';

import { AllowOnlyLoggedInUserOnlyGuard } from '../components/allow-logged-in-user-only-guard';
import { ProjectDashboardLayout } from '../components/project-layout';

import { DefaultRoute } from './default-route';
import {
  ProjectRouterWrapper,
  TokenCheckerWrapper,
} from './project-route-wrapper';

const ChatWithAIPage = React.lazy(() =>
  import('@/app/routes/chat-with-ai').then((m) => ({
    default: m.ChatWithAIPage,
  })),
);

const OverhaulHomePage = React.lazy(() =>
  import('@/app/routes/overhaul-home').then((m) => ({
    default: m.OverhaulHomePage,
  })),
);

const OverhaulAutomationsPage = React.lazy(() =>
  import('@/app/routes/overhaul-automations').then((m) => ({
    default: m.OverhaulAutomationsPage,
  })),
);

const OverhaulRunsPage = React.lazy(() =>
  import('@/app/routes/overhaul-runs').then((m) => ({
    default: m.OverhaulRunsPage,
  })),
);

const OverhaulMemoryPage = React.lazy(() =>
  import('@/app/routes/overhaul-memory').then((m) => ({
    default: m.OverhaulMemoryPage,
  })),
);

const OverhaulReleasesPage = React.lazy(() =>
  import('@/app/routes/overhaul-releases').then((m) => ({
    default: m.OverhaulReleasesPage,
  })),
);

const OverhaulReleaseDetailPage = React.lazy(() =>
  import('@/app/routes/overhaul-releases').then((m) => ({
    default: m.OverhaulReleaseDetailPage,
  })),
);

const OverhaulConnectionsPage = React.lazy(() =>
  import('@/app/routes/overhaul-connections').then((m) => ({
    default: m.OverhaulConnectionsPage,
  })),
);

const OverhaulVariablesPage = React.lazy(() =>
  import('@/app/routes/overhaul-variables').then((m) => ({
    default: m.OverhaulVariablesPage,
  })),
);

const OverhaulTemplatesPage = React.lazy(() =>
  import('@/app/routes/overhaul-templates').then((m) => ({
    default: m.OverhaulTemplatesPage,
  })),
);

const OverhaulTemplateDetailsPage = React.lazy(() =>
  import('@/app/routes/overhaul-template-details').then((m) => ({
    default: m.OverhaulTemplateDetailsPage,
  })),
);

const OverhaulImpactPage = React.lazy(() =>
  import('@/app/routes/overhaul-impact').then((m) => ({
    default: m.OverhaulImpactPage,
  })),
);

const OverhaulLeaderboardPage = React.lazy(() =>
  import('@/app/routes/overhaul-leaderboard').then((m) => ({
    default: m.OverhaulLeaderboardPage,
  })),
);

// My Agent (Insights domain) — wrapped in NewAppShell (like OverhaulImpactPage) so it gets the
// overhaul sidebar + top bar. The browserAgentEnabled plan lock lives inside the inner page.
// Registered at the overhaul path; the bare /agent route stays live too.
const OverhaulAgentPage = React.lazy(() =>
  import('@/app/routes/overhaul-agent').then((m) => ({
    default: m.OverhaulAgentPage,
  })),
);

const OverhaulTablesPage = React.lazy(() =>
  import('@/app/routes/overhaul-tables').then((m) => ({
    default: m.OverhaulTablesPage,
  })),
);

const OverhaulTablesListPage = React.lazy(() =>
  import('@/app/routes/overhaul-tables-list').then((m) => ({
    default: m.OverhaulTablesListPage,
  })),
);

function chatElement() {
  return (
    <AllowOnlyLoggedInUserOnlyGuard>
      <ProjectDashboardLayout>
        <PageTitle title="Chat">
          <Suspense fallback={<RouteLoadingBar />}>
            <ChatWithAIPage />
          </Suspense>
        </PageTitle>
      </ProjectDashboardLayout>
    </AllowOnlyLoggedInUserOnlyGuard>
  );
}

const chatRoutes = [
  { path: '/chat', element: chatElement() },
  { path: '/chat/:conversationId', element: chatElement() },
];

// Overhaul (new IA) — additive routes mounted alongside the current app for verification.
const overhaulRoutes = [
  {
    path: '/home',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="Home">
          <Suspense fallback={<RouteLoadingBar />}>
            <OverhaulHomePage />
          </Suspense>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  // Automations is project-scoped: ProjectRouterWrapper mounts BOTH
  //   /projects/:projectId/build/automations  (access-validated + switches session), and
  //   /build/automations                      (redirects to the current project's URL).
  // This preserves the URL-scoped-project + access-guard capability the old route had.
  ...ProjectRouterWrapper({
    path: '/build/automations',
    element: (
      <PageTitle title="Automations">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulAutomationsPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Runs (Operate domain) — project-scoped like automations. Old /runs stays live.
  ...ProjectRouterWrapper({
    path: '/operate/runs',
    element: (
      <PageTitle title="Runs">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulRunsPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Memory (Operate domain) — project-scoped. Serves BOTH products: personal agent memory and
  // Studio's shared org memory. Memory is a paid capability; the page renders the upgrade prompt
  // itself off the API's 402, since a nav lock cannot distinguish "no agent" from "no memory".
  ...ProjectRouterWrapper({
    path: '/operate/memory',
    element: (
      <PageTitle title="Memory">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulMemoryPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Releases (Operate domain) — project-scoped like runs. Nav entry is plan/permission-gated in
  // DOMAIN_NAV (releasesEnabled + READ_PROJECT_RELEASE). Old /releases + /releases/:id stay live.
  ...ProjectRouterWrapper({
    path: '/operate/releases',
    element: (
      <PageTitle title="Releases">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulReleasesPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  ...ProjectRouterWrapper({
    path: '/operate/releases/:releaseId',
    element: (
      <PageTitle title="Release">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulReleaseDetailPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Connections (Connect domain) — project-scoped. Old /connections stays live.
  ...ProjectRouterWrapper({
    path: '/connect/connections',
    element: (
      <PageTitle title="Connections">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulConnectionsPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Variables (Build domain) — project-scoped. Old /variables stays live.
  ...ProjectRouterWrapper({
    path: '/build/variables',
    element: (
      <PageTitle title="Variables">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulVariablesPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Tables editor (Data domain) — project-scoped like the old /tables/:tableId editor. The tables
  // LIST has no standalone route in this app (tables are browsed inside the Automations page), so
  // only the editor is mounted here. ProjectRouterWrapper mounts both the project-scoped URL and
  // the bare redirect, preserving the URL-scoped-project + access-guard capability. Old
  // /tables/:tableId stays live.
  // Tables LIST (Data domain) — the standalone tables landing page (the nav item previously
  // pointed at Automations because no list page existed). Project-scoped like the editor.
  ...ProjectRouterWrapper({
    path: '/data/tables',
    element: (
      <PageTitle title="Tables">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulTablesListPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  ...ProjectRouterWrapper({
    path: '/data/tables/:tableId',
    element: (
      <PageTitle title="Table">
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulTablesPage />
        </Suspense>
      </PageTitle>
    ),
  }),
  // Explore templates (Build domain) — NOT project-scoped (old /templates is a bare route), so it
  // registers as a plain login-gated route like /home. Old /templates stays live.
  {
    path: '/build/explore',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="Explore templates">
          <Suspense fallback={<RouteLoadingBar />}>
            <OverhaulTemplatesPage />
          </Suspense>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  // Template detail (Build → Explore) — the new-shell counterpart of legacy /templates/:templateId.
  // Login-gated like /build/explore; renders the same immersive full-screen preview with overhaul
  // back/share nav. Old /templates/:templateId stays live.
  {
    path: '/build/explore/:templateId',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <Suspense fallback={<RouteLoadingBar />}>
          <OverhaulTemplateDetailsPage />
        </Suspense>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  // Impact (Insights domain) — NOT project-scoped (old /impact is a bare route), so it registers
  // as a plain login-gated route like /home. The analyticsEnabled plan lock lives inside the page.
  // Old /impact stays live.
  {
    path: '/insights/impact',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="Impact">
          <Suspense fallback={<RouteLoadingBar />}>
            <OverhaulImpactPage />
          </Suspense>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  // Leaderboard (Insights domain) — NOT project-scoped (old /leaderboard is a bare route), so it
  // registers as a plain login-gated route like /home. The analyticsEnabled plan lock lives inside
  // the page. Old /leaderboard stays live.
  {
    path: '/insights/leaderboard',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="Leaderboard">
          <Suspense fallback={<RouteLoadingBar />}>
            <OverhaulLeaderboardPage />
          </Suspense>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  // My Agent (Insights domain) — NOT project-scoped, plain login-gated; the browserAgentEnabled plan
  // lock lives inside the page. Old /agent stays live.
  {
    path: '/insights/agent',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="My Agent">
          <Suspense fallback={<RouteLoadingBar />}>
            <OverhaulAgentPage />
          </Suspense>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
];

const routes = [
  ...publicRoutes,
  ...projectRoutes,
  ...authRoutes,
  ...platformRoutes,
  ...overhaulRoutes,
  // Overhaul Admin (/admin/**) — additive, NewAppShell-hosted mirror of platformRoutes. Self-gated
  // by OverhaulAdminShell (login guard + platform-admin check), exactly like platformRoutes are
  // self-gated by PlatformLayout. Old /platform/** routes stay live.
  ...overhaulAdminRoutes,
  ...chatRoutes,
  {
    path: '/projects/:projectId',
    element: (
      <TokenCheckerWrapper>
        <DefaultRoute></DefaultRoute>
      </TokenCheckerWrapper>
    ),
  },
  {
    path: '/*',
    element: (
      <PageTitle title="Redirect">
        <DefaultRoute></DefaultRoute>
      </PageTitle>
    ),
  },
];

export const memoryRouter = createMemoryRouter(routes);
const browserRouter = createBrowserRouter(routes);

const IbRouter = () => {
  const { embedState } = useEmbedding();
  const router = embedState.isEmbedded ? memoryRouter : browserRouter;
  return <RouterProvider router={router}></RouterProvider>;
};

export { IbRouter };
