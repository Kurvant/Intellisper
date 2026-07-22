import { Permission } from '@intelblocks/shared';
import { t } from 'i18next';
import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import { RoutePermissionGuard } from '../../guards/permission-guard';
import { AppConnectionsPage } from '../connections';

import { ConnectionsGallery } from './components/connections-gallery';

const CONNECTIONS_VIEW_STORAGE_KEY = 'ib.connections.viewMode';

/**
 * Connections in the new domain shell (Connect domain). Different layout/feel: a premium card
 * gallery is the default, with a toggle back to the (overhaul-styled) table. Both views reuse the
 * exact same connections hooks/dialogs/actions, so every capability is preserved. Old /connections
 * route stays untouched.
 */
export function OverhaulConnectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const scopeKey =
    projectId ?? authenticationSession.getProjectId() ?? 'connections';

  const [viewMode, setViewModeState] = useState<'gallery' | 'table'>(() =>
    localStorage.getItem(CONNECTIONS_VIEW_STORAGE_KEY) === 'table'
      ? 'table'
      : 'gallery',
  );
  const setViewMode = (mode: 'gallery' | 'table') => {
    localStorage.setItem(CONNECTIONS_VIEW_STORAGE_KEY, mode);
    setViewModeState(mode);
  };

  return (
    <NewAppShell
      title={t('Connections')}
      subtitle={t('Manage the credentials your automations use to reach apps')}
      actions={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
    >
      <RoutePermissionGuard
        requiredPermissions={[Permission.READ_APP_CONNECTION]}
      >
        <div className="mx-auto max-w-[1400px] px-7 py-6">
          {viewMode === 'gallery' ? (
            <ConnectionsGallery key={scopeKey} />
          ) : (
            <AppConnectionsPage key={scopeKey} variant="overhaul" />
          )}
        </div>
      </RoutePermissionGuard>
    </NewAppShell>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: 'gallery' | 'table';
  onChange: (mode: 'gallery' | 'table') => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Gallery view')}
        aria-pressed={value === 'gallery'}
        onClick={() => onChange('gallery')}
        className={cn(
          'rounded-md',
          value === 'gallery'
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-muted-foreground',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Table view')}
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
        className={cn(
          'rounded-md',
          value === 'table'
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-muted-foreground',
        )}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default OverhaulConnectionsPage;
