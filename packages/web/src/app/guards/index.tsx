import React, { Suspense } from 'react';
import {
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
} from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { authRoutes } from '@/app/routes/auth-routes';
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
];

const routes = [
  ...publicRoutes,
  ...projectRoutes,
  ...authRoutes,
  ...platformRoutes,
  ...overhaulRoutes,
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
