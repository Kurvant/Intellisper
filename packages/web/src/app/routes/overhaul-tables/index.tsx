import { Permission } from '@intelblocks/shared';
import { t } from 'i18next';
import { Navigate } from 'react-router-dom';

import { useEmbedding } from '@/components/providers/embed-provider';
import { IbTableStateProvider } from '@/features/tables';
import { routesThatRequireProjectId } from '@/lib/route-utils';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import { RoutePermissionGuard } from '../../guards/permission-guard';
import { IbTableEditorPage } from '../tables/id';

/**
 * Tables editor in the new domain shell (Data domain). The data-grid editor is a complex,
 * capability-dense surface, so this page reuses the EXISTING editor component (IbTableEditorPage)
 * and its state provider (IbTableStateProvider) VERBATIM — only the surrounding chrome (domain nav
 * + minimal top bar + page header) changes. The spreadsheet grid, its toolbar (rename/import/
 * export/delete, download CSV, record delete, active users, saving indicator, take-over lock) and
 * every capability are preserved untouched.
 *
 * The editor is full-height (h-full → DataGrid !h-full), so it is mounted in an absolutely
 * positioned box that fills the shell's bounded main region, giving the grid the exact same
 * bounded parent height it had under BuilderLayout — the grid design is not restyled.
 *
 * Gates preserved: HideTablesGuard (embed hideTables → redirect to Automations), READ_TABLE route
 * permission, and the WRITE_TABLE gates inside the editor/header. Old /tables/:tableId route stays
 * live and untouched.
 */
export function OverhaulTablesPage() {
  const { embedState } = useEmbedding();

  if (embedState.hideTables) {
    return (
      <Navigate to={routesThatRequireProjectId.automations} replace={true} />
    );
  }

  return (
    <NewAppShell
      title={t('Tables')}
      subtitle={t('Edit rows, columns and cells of your data tables')}
    >
      <RoutePermissionGuard requiredPermissions={Permission.READ_TABLE}>
        <div className="absolute inset-0">
          <IbTableStateProvider>
            <IbTableEditorPage />
          </IbTableStateProvider>
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

export default OverhaulTablesPage;
