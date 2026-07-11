import { useRef } from 'react';

import { CardListItem } from '@/components/custom/card-list';
import {
  BlockIcon,
  BlockSelectorOperation,
  StepMetadataWithSuggestions,
  PIECE_SELECTOR_ELEMENTS_HEIGHTS,
} from '@/features/pieces';
import { useIsMobile } from '@/hooks/use-mobile';
import { wait } from '@/lib/dom-utils';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../builder-hooks';

import { BlockActionsOrTriggersList } from './piece-actions-or-triggers-list';

type BlockCardListItemProps = {
  blockMetadata: StepMetadataWithSuggestions;
  searchQuery: string;
  operation: BlockSelectorOperation;
  isTemporaryDisabledUntilNextCursorMove: boolean;
};

const BlockCardListItem = ({
  blockMetadata,
  searchQuery,
  operation,
  isTemporaryDisabledUntilNextCursorMove,
}: BlockCardListItemProps) => {
  const isMobile = useIsMobile();
  const showSuggestions = searchQuery.length > 0 || isMobile;
  const isMouseOver = useRef(false);
  const selectBlockMetatdata = async () => {
    if (isTemporaryDisabledUntilNextCursorMove || showSuggestions) {
      return;
    }
    isMouseOver.current = true;
    await wait(250);
    if (isMouseOver.current) {
      setSelectedBlockMetadataInBlockSelector(blockMetadata);
    }
  };
  const [
    selectedBlockMetadataInBlockSelector,
    setSelectedBlockMetadataInBlockSelector,
  ] = useBuilderStateContext((state) => [
    state.selectedBlockMetadataInBlockSelector,
    state.setSelectedBlockMetadataInBlockSelector,
  ]);
  const itemHeight = PIECE_SELECTOR_ELEMENTS_HEIGHTS.PIECE_ITEM_HEIGHT;
  return (
    <>
      <CardListItem
        className={cn('flex-col p-3 gap-1 items-start truncate', {
          'hover:bg-transparent!': isTemporaryDisabledUntilNextCursorMove,
        })}
        style={{ height: `${itemHeight}px`, maxHeight: `${itemHeight}px` }}
        selected={
          selectedBlockMetadataInBlockSelector?.displayName ===
            blockMetadata.displayName && searchQuery.length === 0
        }
        interactive={!showSuggestions}
        onMouseEnter={selectBlockMetatdata}
        onMouseMove={selectBlockMetatdata}
        onClick={() => {
          if (!showSuggestions) {
            setSelectedBlockMetadataInBlockSelector(blockMetadata);
          }
        }}
        onMouseLeave={() => {
          isMouseOver.current = false;
        }}
        id={blockMetadata.displayName}
        data-testid={blockMetadata.displayName}
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
        </div>
      </CardListItem>

      {showSuggestions && (
        <div>
          <BlockActionsOrTriggersList
            stepMetadataWithSuggestions={blockMetadata}
            hideBlockIconAndDescription={true}
            operation={operation}
          />
        </div>
      )}
    </>
  );
};

BlockCardListItem.displayName = 'BlockCardListItem';
export { BlockCardListItem };
