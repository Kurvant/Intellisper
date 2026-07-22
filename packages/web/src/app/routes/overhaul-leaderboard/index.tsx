import { t } from 'i18next';

import { NewAppShell } from '../../components/overhaul/new-app-shell';
import LeaderboardPage from '../leaderboard';

/**
 * Leaderboard in the new domain shell (Insights domain). The page title moves into the shell
 * header; the existing LeaderboardPage renders in its `overhaul` variant, which relocates the
 * freshness / refresh / time-period controls onto a glass toolbar — while keeping every tab
 * (People / Projects), the search + time-saved filter + clear controls, CSV download, both
 * leaderboard tables (untouched) and the `analyticsEnabled` plan lock exactly as before. Old
 * /leaderboard route stays untouched.
 */
export function OverhaulLeaderboardPage() {
  return (
    <NewAppShell
      title={t('Leaderboard')}
      subtitle={t('Top performers by automations created and time saved')}
    >
      <div className="mx-auto max-w-[1400px] px-7 py-6">
        <LeaderboardPage variant="overhaul" />
      </div>
    </NewAppShell>
  );
}

export default OverhaulLeaderboardPage;
