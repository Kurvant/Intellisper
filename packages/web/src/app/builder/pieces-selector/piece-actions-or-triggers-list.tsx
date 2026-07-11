import {
  FlowActionType,
  isNil,
  FlowTriggerType,
  TelemetryEventName,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { MoveLeft } from 'lucide-react';
import React from 'react';

import { CardList } from '@/components/custom/card-list';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BlockSelectorItem,
  BlockSelectorOperation,
  StepMetadataWithSuggestions,
  blockSelectorUtils,
  CORE_ACTIONS_METADATA,
  useBlockSearchContext,
} from '@/features/pieces';

import { useBuilderStateContext } from '../builder-hooks';

import GenericActionOrTriggerItem from './generic-piece-selector-item';
type BlockActionsOrTriggersListProps = {
  hideBlockIconAndDescription: boolean;
  stepMetadataWithSuggestions: StepMetadataWithSuggestions | null;
  operation: BlockSelectorOperation;
};
export const convertStepMetadataToBlockSelectorItems = (
  stepMetadataWithSuggestions: StepMetadataWithSuggestions,
): BlockSelectorItem[] => {
  switch (stepMetadataWithSuggestions.type) {
    case FlowActionType.BLOCK: {
      const actions = blockSelectorUtils.removeHiddenActions(
        stepMetadataWithSuggestions,
      );
      return actions.map((action) => ({
        actionOrTrigger: action,
        type: FlowActionType.BLOCK,
        blockMetadata: stepMetadataWithSuggestions,
      }));
    }
    case FlowTriggerType.BLOCK: {
      const triggers = Object.values(
        stepMetadataWithSuggestions.suggestedTriggers ?? {},
      );
      return triggers.map((trigger) => ({
        actionOrTrigger: trigger,
        type: FlowTriggerType.BLOCK,
        blockMetadata: stepMetadataWithSuggestions,
      }));
    }
    case FlowActionType.CODE:
    case FlowActionType.LOOP_ON_ITEMS:
    case FlowActionType.ROUTER: {
      return CORE_ACTIONS_METADATA.filter(
        (step) => step.type === stepMetadataWithSuggestions.type,
      );
    }
    default: {
      return [];
    }
  }
};

export const BlockActionsOrTriggersList: React.FC<
  BlockActionsOrTriggersListProps
> = ({
  stepMetadataWithSuggestions,
  hideBlockIconAndDescription,
  operation,
}) => {
  const { capture } = useTelemetry();
  const { searchQuery } = useBlockSearchContext();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);
  if (isNil(stepMetadataWithSuggestions)) {
    return (
      <div className="flex flex-col gap-2 items-center justify-center h-full w-full">
        <MoveLeft className="w-10 h-10 rtl:rotate-180" />
        <div className="text-sm">{t('Please select a block first')}</div>
      </div>
    );
  }

  const actionsOrTriggers = convertStepMetadataToBlockSelectorItems(
    stepMetadataWithSuggestions,
  );
  return (
    <ScrollArea className="h-full" viewPortClassName="h-full">
      <CardList className="min-w-[350px] h-full gap-0" listClassName="gap-0">
        {actionsOrTriggers &&
          actionsOrTriggers.map((item, index) => {
            return (
              <GenericActionOrTriggerItem
                key={index}
                item={item}
                hideBlockIconAndDescription={hideBlockIconAndDescription}
                stepMetadataWithSuggestions={stepMetadataWithSuggestions}
                onClick={() => {
                  if (
                    item.type === FlowActionType.BLOCK ||
                    item.type === FlowTriggerType.BLOCK
                  ) {
                    capture({
                      name: TelemetryEventName.BLOCK_SELECTOR_SEARCH,
                      payload: {
                        search: searchQuery,
                        isTrigger: item.type === FlowTriggerType.BLOCK,
                        selectedActionOrTriggerName: item.actionOrTrigger.name,
                      },
                    });
                  }

                  handleAddingOrUpdatingStep({
                    blockSelectorItem: item,
                    operation,
                    selectStepAfter: true,
                  });
                }}
              />
            );
          })}
      </CardList>
    </ScrollArea>
  );
};
