import {
  IbFlagId,
  FlowActionType,
  TelemetryEventName,
} from '@intelblocks/shared';
import { t } from 'i18next';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useTelemetry } from '@/components/providers/telemetry-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BlockSelectorOperation,
  StepMetadataWithSuggestions,
  useBlockSearchContext,
} from '@/features/pieces';
import { flagsHooks } from '@/hooks/flags-hooks';

import { useBuilderStateContext } from '../../builder-hooks';
import { convertStepMetadataToBlockSelectorItems } from '../piece-actions-or-triggers-list';

import AIActionItem from './ai-action';

type AIBlockActionsListProps = {
  hideBlockIconAndDescription: boolean;
  stepMetadataWithSuggestions: StepMetadataWithSuggestions;
  operation: BlockSelectorOperation;
};

const ACTION_ICON_MAP: Record<string, string> = {
  run_agent: 'https://cdn.activepieces.com/pieces/new-core/agent.svg',
  generateImage: 'https://cdn.activepieces.com/pieces/new-core/image-ai.svg',
  askAi: 'https://cdn.activepieces.com/pieces/new-core/text-ai.svg',
  summarizeText: 'https://cdn.activepieces.com/pieces/new-core/text-ai.svg',
  classifyText: 'https://cdn.activepieces.com/pieces/new-core/text-ai.svg',
  extractStructuredData:
    'https://cdn.activepieces.com/pieces/new-core/utility-ai.svg',
};

export const AIBlockActionsList: React.FC<AIBlockActionsListProps> = ({
  stepMetadataWithSuggestions,
  hideBlockIconAndDescription,
  operation,
}) => {
  const { capture } = useTelemetry();
  const { searchQuery } = useBlockSearchContext();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);
  const { data: isAgentsConfigured } = flagsHooks.useFlag<boolean>(
    IbFlagId.AGENTS_CONFIGURED,
  );
  const navigate = useNavigate();

  const aiActions = convertStepMetadataToBlockSelectorItems(
    stepMetadataWithSuggestions,
  );

  return (
    <ScrollArea className="h-full" viewPortClassName="h-full">
      <div className="grid grid-cols-3 p-2 gap-3 min-w-[350px]">
        {aiActions.map((item, index) => {
          const actionIcon =
            item.type === FlowActionType.BLOCK
              ? ACTION_ICON_MAP[item.actionOrTrigger.name]
              : 'https://cdn.activepieces.com/pieces/new-core/image-ai.svg';
          return (
            <AIActionItem
              key={index}
              item={item}
              hideBlockIconAndDescription={hideBlockIconAndDescription}
              stepMetadataWithSuggestions={{
                ...stepMetadataWithSuggestions,
                logoUrl: actionIcon,
              }}
              onClick={() => {
                if (!isAgentsConfigured) {
                  toast('Connect to OpenAI', {
                    description: t(
                      "To create an agent, you'll first need to connect to OpenAI in platform settings.",
                    ),
                    action: {
                      label: 'Set Up',
                      onClick: () => {
                        navigate('/platform/setup/ai');
                      },
                    },
                  });
                  return;
                }

                if (item.type === FlowActionType.BLOCK) {
                  capture({
                    name: TelemetryEventName.BLOCK_SELECTOR_SEARCH,
                    payload: {
                      search: searchQuery,
                      isTrigger: false,
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
      </div>
    </ScrollArea>
  );
};
