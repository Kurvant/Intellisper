import { AgentMemoryScope } from '@intelblocks/shared';
import { t } from 'i18next';

import { MemoryPage } from '@/features/browser-agent/memory/memory-page';
import { authenticationSession } from '@/lib/authentication-session';

import { NewAppShell } from '../../components/overhaul/new-app-shell';

/**
 * Memory in the new domain shell (Operate domain) — the member-facing surface for BOTH products:
 *  - "My memory"  → Intellisper Agent's personal memory (scope USER)
 *  - "Org memory" → Intellisper Studio's shared team memory that flows and agent steps draw on
 *                   (scope PLATFORM)
 *
 * A single flow's memory (scope FLOW) is reached from that flow, not here — it belongs beside the
 * flow it describes rather than in a global list.
 *
 * Memory is a paid capability: the page renders an upgrade prompt (not an error) when the plan does
 * not include it. That check lives in the page because a 402 is the server's answer, and a nav-level
 * lock could not distinguish "no agent" from "agent, but no memory".
 */
export function OverhaulMemoryPage() {
  const projectId = authenticationSession.getProjectId()!;

  return (
    <NewAppShell
      title={t('Memory')}
      subtitle={t('What your agent and your flows remember')}
    >
      <div className="mx-auto max-w-[1100px] px-7 py-6">
        <MemoryPage
          projectId={projectId}
          scopes={[AgentMemoryScope.USER, AgentMemoryScope.PLATFORM]}
        />
      </div>
    </NewAppShell>
  );
}

export default OverhaulMemoryPage;
