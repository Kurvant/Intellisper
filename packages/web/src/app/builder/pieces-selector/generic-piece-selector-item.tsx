import { FlowActionType, FlowTriggerType } from '@intelblocks/shared';

import { CardListItem } from '@/components/custom/card-list';
import {
  BlockIcon,
  BlockSelectorItem,
  StepMetadataWithSuggestions,
  PIECE_SELECTOR_ELEMENTS_HEIGHTS,
} from '@/features/pieces';
import { cn } from '@/lib/utils';
type GenericActionOrTriggerItemProps = {
  item: BlockSelectorItem;
  hideBlockIconAndDescription: boolean;
  stepMetadataWithSuggestions: StepMetadataWithSuggestions;
  onClick: () => void;
};

const getBlockSelectorItemInfo = (item: BlockSelectorItem) => {
  if (
    item.type === FlowActionType.BLOCK ||
    item.type === FlowTriggerType.BLOCK
  ) {
    return {
      displayName: item.actionOrTrigger.displayName,
      description: item.actionOrTrigger.description,
    };
  }
  return {
    displayName: item.displayName,
    description: item.description,
  };
};

const GenericActionOrTriggerItem = ({
  item,
  hideBlockIconAndDescription,
  stepMetadataWithSuggestions,
  onClick,
}: GenericActionOrTriggerItemProps) => {
  // we add this style because we hide the piece icon and description when they are in a virtualized list
  const style = hideBlockIconAndDescription
    ? {
        height: `${PIECE_SELECTOR_ELEMENTS_HEIGHTS.ACTION_OR_TRIGGER_ITEM_HEIGHT}px`,
        maxHeight: `${PIECE_SELECTOR_ELEMENTS_HEIGHTS.ACTION_OR_TRIGGER_ITEM_HEIGHT}px`,
      }
    : {
        minHeight: '54px',
      };
  const blockSelectorItemInfo = getBlockSelectorItemInfo(item);
  return (
    <CardListItem
      className={cn('p-2 w-full ', {
        truncate: hideBlockIconAndDescription,
      })}
      onClick={onClick}
      style={style}
    >
      <div className="flex gap-3 items-center">
        <div
          className={cn({
            'opacity-0': hideBlockIconAndDescription,
          })}
        >
          <BlockIcon
            logoUrl={stepMetadataWithSuggestions.logoUrl}
            displayName={stepMetadataWithSuggestions.displayName}
            showTooltip={false}
            size={'sm'}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-sm">{blockSelectorItemInfo.displayName}</div>
          {!hideBlockIconAndDescription && (
            <div className="text-xs text-muted-foreground">
              {blockSelectorItemInfo.description.endsWith('.')
                ? blockSelectorItemInfo.description.slice(0, -1)
                : blockSelectorItemInfo.description}
            </div>
          )}
        </div>
      </div>
    </CardListItem>
  );
};

GenericActionOrTriggerItem.displayName = 'GenericActionOrTriggerItem';
export default GenericActionOrTriggerItem;
