import { Permission } from '@intelblocks/shared';
import { t } from 'i18next';

import { RoutePermissionGuard } from '@/app/guards/permission-guard';
import { AutomationsPage } from '@/app/routes/automations';

import { NewAppShell } from '../../components/overhaul/new-app-shell';

/**
 * Automations inside the new overhaul shell (Pillar 3d). This is the first capability-bearing
 * surface, so the strategy is capability-preservation by REUSE: it renders the existing, fully
 * featured <AutomationsPage/> verbatim (which owns all BLD-145..204 list capabilities — filters,
 * bulk actions, pin/favorite, row menus, import/export, folders, create-menu, empty states) and
 * only wraps it in the new domain-nav shell. Nothing is re-implemented, so nothing is lost.
 */
const automationsPermissions = [
  Permission.READ_FLOW,
  Permission.READ_TABLE,
  Permission.READ_FOLDER,
];

export function OverhaulAutomationsPage() {
  return (
    <NewAppShell
      title={t('Automations')}
      subtitle={t('Build and organize your flows, tables and folders')}
    >
      <RoutePermissionGuard requiredPermissions={automationsPermissions}>
        <div className="mx-auto max-w-[1280px] px-7 py-6">
          <AutomationsPage />
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

export default OverhaulAutomationsPage;
