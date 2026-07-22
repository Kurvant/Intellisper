import { Permission } from '@intelblocks/shared';

import { authenticationSession } from './authentication-session';

export const routesThatRequireProjectId = {
  runs: '/runs',
  singleRun: '/runs/:runId',
  flows: '/flows',
  singleFlow: '/flows/:flowId',
  automations: '/automations',
  connections: '/connections',
  singleConnection: '/connections/:connectionId',
  variables: '/variables',
  tables: '/tables',
  singleTable: '/tables/:tableId',
  settings: '/settings',
  releases: '/releases',
  singleRelease: '/releases/:releaseId',
};

/**
 * The landing route for "/" / post-login / "back to app". `variant` selects which frontend the
 * user lands in:
 *  - 'overhaul' (default) → the new domain shell (/build/automations, /operate/runs, /home). This
 *    is the app default so every default-navigation lands users in the new design.
 *  - 'default' → the legacy project shell (/automations, /runs, /settings). Used ONLY by the embed
 *    iframe, which is a legacy-shell context (hideSideNav / hideFlowsPageNavbar / etc.).
 * The permission fallbacks (flow/table → automations, run → runs, else settings/home) are identical
 * across both variants so access-gating behaviour is unchanged — only the target shell differs.
 */
export const determineDefaultRoute = (
  checkAccess: (permission: Permission) => boolean,
  variant: 'default' | 'overhaul' = 'overhaul',
) => {
  const canReadAutomations =
    checkAccess(Permission.READ_FLOW) || checkAccess(Permission.READ_TABLE);
  if (variant === 'overhaul') {
    if (canReadAutomations) {
      return authenticationSession.appendProjectRoutePrefix(
        '/build/automations',
      );
    }
    if (checkAccess(Permission.READ_RUN)) {
      return authenticationSession.appendProjectRoutePrefix('/operate/runs');
    }
    // No flow/table/run access → the overhaul home command-center (login-gated, not project-scoped).
    return '/home';
  }
  if (canReadAutomations) {
    return authenticationSession.appendProjectRoutePrefix('/automations');
  }
  if (checkAccess(Permission.READ_RUN)) {
    return authenticationSession.appendProjectRoutePrefix('/runs');
  }
  return authenticationSession.appendProjectRoutePrefix('/settings');
};

export const NEW_FLOW_QUERY_PARAM = 'newFlow';
export const NEW_TABLE_QUERY_PARAM = 'newTable';
