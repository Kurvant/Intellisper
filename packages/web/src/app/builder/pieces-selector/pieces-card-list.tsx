import {
  FlowActionType,
  FlowOperationType,
  FlowTriggerType,
} from '@intelblocks/shared';
import React, { useState } from 'react';

import { CardListItemSkeleton } from '@/components/custom/card-list';
import { Separator } from '@/components/ui/separator';
import { VirtualizedScrollArea } from '@/components/ui/virtualized-scroll-area';
import {
  blocksHooks,
  BlockSelectorTabType,
  useBlockSelectorTabs,
  BlockSelectorOperation,
  StepMetadataWithSuggestions,
  CategorizedStepMetadataWithSuggestions,
  PIECE_SELECTOR_ELEMENTS_HEIGHTS,
  blockSelectorUtils,
} from '@/features/pieces';
import { useIsMobile } from '@/hooks/use-mobile';

import { cn } from '../../../lib/utils';
import { useBuilderStateContext } from '../builder-hooks';

import { NoResultsFound } from './no-results-found';
import { BlockActionsOrTriggersList } from './piece-actions-or-triggers-list';
import { BlockCardListItem } from './piece-card-item';

type BlocksCardListProps = {
  searchQuery: string;
  operation: BlockSelectorOperation;
  stepToReplaceBlockDisplayName?: string;
};

export const BlocksCardList: React.FC<BlocksCardListProps> = ({
  searchQuery,
  operation,
  stepToReplaceBlockDisplayName,
}) => {
  const isMobile = useIsMobile();
  const [selectedBlockMetadataInBlockSelector] = useBuilderStateContext(
    (state) => [state.selectedBlockMetadataInBlockSelector],
  );
  const { isLoading: isLoadingBlocks, data: categories } =
    blocksHooks.useBlocksSearch({
      shouldCaptureEvent: true,
      searchQuery,
      type:
        operation.type === FlowOperationType.UPDATE_TRIGGER
          ? 'trigger'
          : 'action',
    });

  const noResultsFound = !isLoadingBlocks && categories.length === 0;
  const [mouseMoved, setMouseMoved] = useState(false);
  const showActionsOrTriggersInsideBlocksList =
    searchQuery.length > 0 || isMobile;
  const virtualizedItems = transformBlocksMetadataToVirtualizedItems(
    categories,
    showActionsOrTriggersInsideBlocksList,
  );

  const initialIndexToScrollToInBlocksList = virtualizedItems.findIndex(
    (item) => item.displayName === stepToReplaceBlockDisplayName,
  );
  const { selectedTab } = useBlockSelectorTabs();

  const isLoading = isLoadingBlocks;
  const showActionsOrTriggersList =
    searchQuery.length === 0 && !isMobile && !noResultsFound && !isLoading;
  const showBlocksList = !noResultsFound && !isLoading;
  if (
    [
      BlockSelectorTabType.EXPLORE,
      BlockSelectorTabType.AI_AND_AGENTS,
      BlockSelectorTabType.APPROVALS,
    ].includes(selectedTab)
  ) {
    return null;
  }
  return (
    <>
      <div
        onMouseMove={() => {
          setMouseMoved(!isLoadingBlocks);
        }}
        className={cn('w-full md:w-[250px] md:min-w-[250px] transition-all ', {
          'w-full md:w-full': searchQuery.length > 0 || noResultsFound,
        })}
      >
        {isLoading && (
          <div className="flex flex-col gap-2">
            <CardListItemSkeleton numberOfCards={2} withCircle={false} />
          </div>
        )}

        {showBlocksList && (
          <VirtualizedScrollArea
            key={`${selectedTab}-${searchQuery}`}
            initialScroll={{
              index: initialIndexToScrollToInBlocksList,
              clickAfterScroll: true,
            }}
            items={virtualizedItems}
            estimateSize={(index) => virtualizedItems[index].height}
            getItemKey={(index) => virtualizedItems[index].id}
            renderItem={(item) => {
              if (item.isCategory) {
                return (
                  <div
                    className={cn('p-2 pb-0 text-sm text-muted-foreground')}
                    id={item.displayName}
                  >
                    {item.displayName}
                  </div>
                );
              }
              return (
                <BlockCardListItem
                  blockMetadata={item.blockMetadata}
                  searchQuery={searchQuery}
                  operation={operation}
                  isTemporaryDisabledUntilNextCursorMove={!mouseMoved}
                />
              );
            }}
          />
        )}

        {noResultsFound && <NoResultsFound />}
      </div>

      {showActionsOrTriggersList && (
        <>
          <Separator orientation="vertical" className="h-full" />
          <BlockActionsOrTriggersList
            stepMetadataWithSuggestions={selectedBlockMetadataInBlockSelector}
            hideBlockIconAndDescription={false}
            operation={operation}
          />
        </>
      )}
    </>
  );
};

type VirtualizedItem = {
  id: string;
  displayName: string;
  height: number;
} & (
  | {
      isCategory: true;
    }
  | {
      isCategory: false;
      blockMetadata: StepMetadataWithSuggestions;
    }
);
const transformBlocksMetadataToVirtualizedItems = (
  searchResult: CategorizedStepMetadataWithSuggestions[],
  showActionsOrTriggersInsideBlocksList: boolean,
) => {
  return searchResult.reduce<VirtualizedItem[]>((result, category) => {
    if (!showActionsOrTriggersInsideBlocksList) {
      result.push({
        id: category.title,
        displayName: category.title,
        height: PIECE_SELECTOR_ELEMENTS_HEIGHTS.CATEGORY_ITEM_HEIGHT,
        isCategory: true,
      });
    }
    category.metadata.forEach((blockMetadata, index) => {
      result.push({
        id: `${blockMetadata.displayName}-${index}`,
        height: getItemHeight(
          blockMetadata,
          showActionsOrTriggersInsideBlocksList,
        ),
        isCategory: false,
        blockMetadata,
        displayName: blockMetadata.displayName,
      });
    });
    return result;
  }, []);
};

const getItemHeight = (
  blockMetadata: StepMetadataWithSuggestions,
  showActionsOrTriggersInsideBlocksList: boolean,
) => {
  const { ACTION_OR_TRIGGER_ITEM_HEIGHT, PIECE_ITEM_HEIGHT } =
    PIECE_SELECTOR_ELEMENTS_HEIGHTS;
  if (
    blockMetadata.type === FlowActionType.BLOCK &&
    showActionsOrTriggersInsideBlocksList
  ) {
    const actionsListWithoutHiddenActions =
      blockSelectorUtils.removeHiddenActions(blockMetadata);
    return (
      ACTION_OR_TRIGGER_ITEM_HEIGHT *
        Object.values(actionsListWithoutHiddenActions).length +
      PIECE_ITEM_HEIGHT
    );
  }
  if (
    blockMetadata.type === FlowTriggerType.BLOCK &&
    showActionsOrTriggersInsideBlocksList
  ) {
    return (
      ACTION_OR_TRIGGER_ITEM_HEIGHT *
        Object.values(blockMetadata.suggestedTriggers ?? {}).length +
      PIECE_ITEM_HEIGHT
    );
  }
  const isCoreAction =
    blockMetadata.type === FlowActionType.CODE ||
    blockMetadata.type === FlowActionType.LOOP_ON_ITEMS ||
    blockMetadata.type === FlowActionType.ROUTER;
  if (isCoreAction && showActionsOrTriggersInsideBlocksList) {
    return ACTION_OR_TRIGGER_ITEM_HEIGHT + PIECE_ITEM_HEIGHT;
  }
  return PIECE_ITEM_HEIGHT;
};
