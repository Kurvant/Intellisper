import { Permission } from '@intelblocks/shared';
import { t } from 'i18next';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import { RoutePermissionGuard } from '../../guards/permission-guard';
import { ProjectReleasesPage } from '../project-release';
import ViewRelease from '../project-release/view-release';

/**
 * Releases in the new domain shell (Operate domain). The new-shell counterpart of the legacy
 * /releases + /releases/:releaseId project routes. Both the list and the detail render the SAME
 * page components as legacy (ProjectReleasesPage / ViewRelease) with `variant="overhaul"` so their
 * internal navigation (row-click, breadcrumb back, post-rollback) stays inside the new shell and
 * points at /operate/releases. Every capability is preserved — push everything, create-from-git /
 * from-project, rollback, view detail. The shell provides the title/subtitle header; the pages drop
 * nothing. Old /releases routes stay live and untouched.
 */
export function OverhaulReleasesPage() {
  return (
    <NewAppShell
      title={t('Releases')}
      subtitle={t('Version, promote and roll back your project')}
    >
      <RoutePermissionGuard
        requiredPermissions={[Permission.READ_PROJECT_RELEASE]}
      >
        <div className="mx-auto max-w-[1400px] px-7 py-6">
          <ProjectReleasesPage variant="overhaul" />
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

/**
 * Release detail in the new shell. ViewRelease renders its own breadcrumb/title, so it sits inside
 * the shell content frame with overhaul back-navigation.
 */
export function OverhaulReleaseDetailPage() {
  return (
    <NewAppShell
      title={t('Release')}
      subtitle={t('Release contents and rollback')}
    >
      <RoutePermissionGuard
        requiredPermissions={[Permission.READ_PROJECT_RELEASE]}
      >
        <div className="mx-auto max-w-[1400px] px-7 py-6">
          <ViewRelease variant="overhaul" />
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

export default OverhaulReleasesPage;
