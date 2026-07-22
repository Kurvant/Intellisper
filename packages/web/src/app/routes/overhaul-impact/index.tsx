import { t } from 'i18next';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import ImpactPage from '../impact';

/**
 * Impact in the new domain shell (Insights domain). The page title moves into the shell header;
 * the existing ImpactPage renders in its `overhaul` variant, which relocates the freshness /
 * refresh / time-period / project controls onto a glass toolbar and gives the summary metrics a
 * glassmorphism surface — while keeping every tab, chart, filter, table, CSV export, edit-time
 * popover and the `analyticsEnabled` plan lock exactly as before. Old /impact route stays untouched.
 */
export function OverhaulImpactPage() {
  return (
    <NewAppShell
      title={t('Impact')}
      subtitle={t('Impact analytics and metrics for your active automations')}
    >
      <div className="mx-auto max-w-[1400px] px-7 py-6">
        <ImpactPage variant="overhaul" />
      </div>
    </NewAppShell>
  );
}

export default OverhaulImpactPage;
