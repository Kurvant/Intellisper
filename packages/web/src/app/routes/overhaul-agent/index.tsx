import { t } from 'i18next';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import AgentActivityPage from '../agent';

/**
 * "My Agent" in the new domain shell (Insights domain). The page title moves into the shell header;
 * the existing AgentActivityPage (runs list + usage) renders inside the shell's content frame, with
 * its `browserAgentEnabled` plan lock intact. The old bare `/agent` route stays untouched.
 */
export function OverhaulAgentPage() {
  return (
    <NewAppShell
      title={t('Agent Routines')}
      subtitle={t('Your Intellisper agent runs, activity and usage')}
    >
      <div className="mx-auto max-w-[1400px] px-7 py-6">
        <AgentActivityPage variant="overhaul" />
      </div>
    </NewAppShell>
  );
}

export default OverhaulAgentPage;
