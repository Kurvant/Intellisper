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
import { VariablesPage } from '../variables';

import { VariablesGallery } from './components/variables-gallery';

const VARIABLES_VIEW_STORAGE_KEY = 'ib.variables.viewMode';

/**
 * Variables in the new domain shell (Build domain). Different layout/feel from the old page: a
 * premium card gallery is the default, with a toggle back to the (overhaul-styled) table — so the
 * look is new while every capability is preserved on both views. Both the gallery and the table
 * reuse the exact same Variables hooks/dialogs/actions. Old /variables route stays untouched.
 */
export function OverhaulVariablesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const scopeKey =
    projectId ?? authenticationSession.getProjectId() ?? 'variables';

  const [viewMode, setViewModeState] = useState<'gallery' | 'table'>(() =>
    localStorage.getItem(VARIABLES_VIEW_STORAGE_KEY) === 'table'
      ? 'table'
      : 'gallery',
  );
  const setViewMode = (mode: 'gallery' | 'table') => {
    localStorage.setItem(VARIABLES_VIEW_STORAGE_KEY, mode);
    setViewModeState(mode);
  };

  return (
    <NewAppShell
      title={t('Variables')}
      subtitle={t('Store values your automations reference from any step')}
      actions={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
    >
      <RoutePermissionGuard requiredPermissions={[Permission.READ_VARIABLE]}>
        <div className="mx-auto max-w-[1400px] px-7 py-6">
          {viewMode === 'gallery' ? (
            <VariablesGallery key={scopeKey} />
          ) : (
            <VariablesPage key={scopeKey} variant="overhaul" />
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

export default OverhaulVariablesPage;
