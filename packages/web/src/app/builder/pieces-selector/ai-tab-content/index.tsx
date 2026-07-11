import { FlowOperationType, isNil } from '@intelblocks/shared';
import { t } from 'i18next';

import { CardListItemSkeleton } from '@/components/custom/card-list';
import {
  blocksHooks,
  BlockSelectorTabType,
  useBlockSelectorTabs,
  BlockSelectorOperation,
  stepUtils,
} from '@/features/pieces';

import { AIBlockActionsList } from './ai-actions-list';

const AITabContent = ({ operation }: { operation: BlockSelectorOperation }) => {
  const { selectedTab } = useBlockSelectorTabs();
  const isActive =
    selectedTab === BlockSelectorTabType.AI_AND_AGENTS &&
    [FlowOperationType.ADD_ACTION, FlowOperationType.UPDATE_ACTION].includes(
      operation.type,
    );
  // Only fetch once this tab is actually shown. Fetching on every mount requests the
  // AI block even when the tab is hidden, which 404s on catalogs that lack it.
  const { blockModel, isLoading } = blocksHooks.useBlock({
    name: '@intelblocks/block-ai',
    enabled: isActive,
  });

  if (!isActive) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <CardListItemSkeleton numberOfCards={2} withCircle={false} />
      </div>
    );
  }

  // The AI block may be absent from this deployment's catalog. Say so rather than
  // spinning forever on a request that will never resolve.
  if (isNil(blockModel)) {
    return (
      <div className="flex w-full items-center justify-center p-4 text-sm text-muted-foreground">
        {t('No AI actions are available in this instance.')}
      </div>
    );
  }

  const metadata = stepUtils.mapBlockToMetadata({
    block: blockModel,
    type: 'action',
  });

  const blockMetadataWithSuggestion = {
    ...metadata,
    suggestedActions: Object.values(blockModel?.actions),
    suggestedTriggers: Object.values(blockModel.triggers),
  };

  return (
    <div className="w-full">
      <AIBlockActionsList
        stepMetadataWithSuggestions={blockMetadataWithSuggestion}
        hideBlockIconAndDescription={false}
        operation={operation}
      />
    </div>
  );
};

export { AITabContent };
