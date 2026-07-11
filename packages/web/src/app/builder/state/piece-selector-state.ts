import { FlowTriggerType } from '@intelblocks/shared';
import { StoreApi } from 'zustand';

import { RightSideBarType } from '@/app/builder/types';
import { StepMetadataWithSuggestions } from '@/features/pieces';

import { BuilderState } from '../builder-hooks';

export type BlockSelectorState = {
  openedBlockSelectorStepNameOrAddButtonId: string | null;
  setOpenedBlockSelectorStepNameOrAddButtonId: (
    stepNameOrAddButtonId: string | null,
  ) => void;
  selectedBlockMetadataInBlockSelector: StepMetadataWithSuggestions | null;
  setSelectedBlockMetadataInBlockSelector: (
    metadata: StepMetadataWithSuggestions | null,
  ) => void;
};

export const createBlockSelectorState = (
  _: StoreApi<BuilderState>['getState'],
  set: StoreApi<BuilderState>['setState'],
): BlockSelectorState => {
  return {
    openedBlockSelectorStepNameOrAddButtonId: null,
    setOpenedBlockSelectorStepNameOrAddButtonId: (
      stepNameOrAddButtonId: string | null,
    ) => {
      return set((state) => {
        const isReplacingEmptyTrigger =
          state.flowVersion.trigger.type === FlowTriggerType.EMPTY &&
          stepNameOrAddButtonId === 'trigger';
        return {
          openedBlockSelectorStepNameOrAddButtonId: stepNameOrAddButtonId,
          rightSidebar: isReplacingEmptyTrigger
            ? RightSideBarType.NONE
            : state.rightSidebar,
        };
      });
    },
    selectedBlockMetadataInBlockSelector: null,
    setSelectedBlockMetadataInBlockSelector: (
      metadata: StepMetadataWithSuggestions | null,
    ) => {
      return set(() => ({
        selectedBlockMetadataInBlockSelector: metadata,
      }));
    },
  };
};
