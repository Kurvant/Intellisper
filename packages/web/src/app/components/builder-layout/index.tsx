import { IbEdition, IbFlagId } from '@intelblocks/shared';

import { useEmbedding } from '@/components/providers/embed-provider';
import { PurchaseExtraFlowsDialog } from '@/features/billing';
import { flagsHooks } from '@/hooks/flags-hooks';
import { cn } from '@/lib/utils';

import { GlobalSearchProvider } from '../global-search/global-search-context';
import { DomainNav } from '../overhaul/new-app-shell';

/**
 * Layout for full-screen work surfaces (flow builder / run viewer / legacy table editor).
 * Carries the NEW shell's navigation (DomainNav — icon rail + drawer) so every link reachable
 * from these surfaces stays inside the overhaul IA. The legacy ProjectDashboardSidebar
 * (hover rail linking to old-shell pages) was deliberately removed — the builder must not
 * offer navigation into the old shell.
 */
export function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalSearchProvider>
      <BuilderLayoutInner>{children}</BuilderLayoutInner>
    </GlobalSearchProvider>
  );
}

function BuilderLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);
  const { embedState } = useEmbedding();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-sidebar">
      {!embedState.isEmbedded && <DomainNav />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'flex-1 flex flex-col overflow-hidden',
            !embedState.isEmbedded && 'p-1.5',
          )}
        >
          <div
            className={cn(
              'flex flex-col h-full bg-background overflow-hidden',
              embedState.isEmbedded
                ? 'border-l'
                : 'rounded-xl shadow-[2px_0px_4px_-2px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.05)] border',
            )}
          >
            {children}
          </div>
        </div>
        {edition === IbEdition.CLOUD && <PurchaseExtraFlowsDialog />}
      </div>
    </div>
  );
}
