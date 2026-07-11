import { FlowOperationType } from '@intelblocks/shared';

import {
  CardListItem,
  CardListItemSkeleton,
} from '@/components/custom/card-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BlockIcon,
  blocksHooks,
  BlockSelectorTabType,
  useBlockSelectorTabs,
  BlockSelectorOperation,
} from '@/features/pieces';

import { BlockActionsOrTriggersList } from './piece-actions-or-triggers-list';

const ExploreTabContent = ({
  operation,
}: {
  operation: BlockSelectorOperation;
}) => {
  const { selectedTab, selectedBlockInExplore, setSelectedBlockInExplore } =
    useBlockSelectorTabs();
  const { data: categories, isLoading: isLoadingBlocks } =
    blocksHooks.useBlocksSearch({
      shouldCaptureEvent: false,
      searchQuery: '',
      type:
        operation.type === FlowOperationType.UPDATE_TRIGGER
          ? 'trigger'
          : 'action',
    });
  if (selectedTab !== BlockSelectorTabType.EXPLORE) {
    return null;
  }
  if (isLoadingBlocks) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <CardListItemSkeleton numberOfCards={2} withCircle={false} />
      </div>
    );
  }

  if (selectedBlockInExplore) {
    return (
      <div className="w-full">
        <BlockActionsOrTriggersList
          stepMetadataWithSuggestions={selectedBlockInExplore}
          hideBlockIconAndDescription={false}
          operation={operation}
        />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex  p-2  ">
        {categories.map((category) => (
          <div key={category.title} className="flex w-[50%] flex-col gap-0.5 ">
            <div className="text-sm text-muted-foreground mb-1.5">
              {category.title}
            </div>

            {category.metadata.map((blockMetadata) => (
              <CardListItem
                className="rounded-sm py-3"
                key={blockMetadata.displayName}
                onClick={() => setSelectedBlockInExplore(blockMetadata)}
              >
                <div className="flex gap-2 items-center h-full">
                  <BlockIcon
                    logoUrl={blockMetadata.logoUrl}
                    displayName={blockMetadata.displayName}
                    showTooltip={false}
                    size={'sm'}
                  />
                  <div className="grow h-full flex items-center justify-left text-sm">
                    {blockMetadata.displayName}
                  </div>
                </div>{' '}
              </CardListItem>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export { ExploreTabContent };
