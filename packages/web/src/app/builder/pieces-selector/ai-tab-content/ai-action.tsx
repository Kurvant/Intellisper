import { FlowActionType, FlowTriggerType } from '@intelblocks/shared';

import { CardListItem } from '@/components/custom/card-list';
import {
  BlockIcon,
  BlockSelectorItem,
  StepMetadataWithSuggestions,
} from '@/features/pieces';

type AIActionItemProps = {
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

const AIActionItem = ({
  item,
  stepMetadataWithSuggestions,
  onClick,
}: AIActionItemProps) => {
  const blockSelectorItemInfo = getBlockSelectorItemInfo(item);

  return (
    <CardListItem
      className="p-4 w-full h-full rounded-md flex flex-col justify-between h-[125px]"
      onClick={onClick}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-center">
          <BlockIcon
            logoUrl={stepMetadataWithSuggestions.logoUrl}
            displayName={stepMetadataWithSuggestions.displayName}
            showTooltip={false}
            size={'lg'}
          />
        </div>
        <div className="flex flex-col gap-1 text-center">
          <div className="text-sm font-medium leading-tight">
            {blockSelectorItemInfo.displayName}
          </div>
        </div>
      </div>
    </CardListItem>
  );
};

AIActionItem.displayName = 'AIActionItem';
export default AIActionItem;
