import { FlowOperationType } from '@intelblocks/shared';

import {
  BlockSelectorOperation,
  BlockSelectorBlockItem,
  blockSelectorUtils,
} from '@/features/pieces';

import { BuilderState } from '../builder-hooks';

export const handleAddingOrUpdatingCustomAgentBlockSelectorItem = (
  agentBlockSelectorItem: BlockSelectorBlockItem,
  operation: BlockSelectorOperation,
  handleAddingOrUpdatingStep: BuilderState['handleAddingOrUpdatingStep'],
) => {
  const stepName = handleAddingOrUpdatingStep({
    blockSelectorItem: agentBlockSelectorItem,
    operation,
    selectStepAfter: true,
  });
  const defaultValues = blockSelectorUtils.getDefaultStepValues({
    stepName,
    blockSelectorItem: agentBlockSelectorItem,
  });
  return handleAddingOrUpdatingStep({
    blockSelectorItem: agentBlockSelectorItem,
    operation: {
      type: FlowOperationType.UPDATE_ACTION,
      stepName,
    },
    selectStepAfter: false,
    overrideSettings: defaultValues.settings,
  });
};
