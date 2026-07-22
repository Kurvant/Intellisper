import { t } from 'i18next';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import { TemplatesPage } from '../templates';

/**
 * Explore templates in the new domain shell (Build domain). Templates is already a card gallery, so
 * rather than rebuild it we render the existing TemplatesPage in its `overhaul` variant inside the
 * new shell (the shell provides the title/subtitle header; the page drops its own PageHeader and
 * presents a gallery-styled search + "Start from scratch" toolbar). Every capability is preserved —
 * category filtering, per-category carousels, all-categories vs selected-category views, lazy
 * section loading, empty/no-results states, template select -> detail, and start-from-scratch. The
 * old /templates route stays untouched.
 */
export function OverhaulTemplatesPage() {
  return (
    <NewAppShell
      title={t('Explore templates')}
      subtitle={t('Start from a ready-made automation and make it your own')}
    >
      <div className="mx-auto max-w-[1400px] px-7 py-6">
        <TemplatesPage variant="overhaul" />
      </div>
    </NewAppShell>
  );
}

export default OverhaulTemplatesPage;
