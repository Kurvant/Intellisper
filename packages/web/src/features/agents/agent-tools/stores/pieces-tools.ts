import { ActionBase } from '@intelblocks/blocks-framework';
import {
  AgentBlockTool,
  AgentToolType,
  isNil,
  PredefinedInputsStructure,
  mcpToolNameUtils,
} from '@intelblocks/shared';
import { create } from 'zustand';

import { BlockStepMetadataWithSuggestions } from '@/features/pieces/types';

type SelectedDialogPage = 'pieces-list' | 'actions-list' | 'action-inputs';

interface BlocksToolDialogsState {
  showAddBlockDialog: boolean;
  selectedPage: SelectedDialogPage;
  searchQuery: string;
  selectedBlock?: BlockStepMetadataWithSuggestions;
  selectedAction?: ActionBase;
  predefinedInputs?: PredefinedInputsStructure;
  editingBlockTool?: AgentBlockTool;

  setSelectedPage: (page: SelectedDialogPage) => void;
  setSearchQuery: (query: string) => void;
  setPredefinedInputs: (inputs: PredefinedInputsStructure) => void;

  openAddBlockToolDialog: ({
    page,
    tool,
    block,
  }: {
    page?: SelectedDialogPage;
    tool?: AgentBlockTool;
    block?: BlockStepMetadataWithSuggestions;
  }) => void;

  handleBlockSelect: (block: BlockStepMetadataWithSuggestions) => void;
  handleActionSelect: (action: ActionBase) => void;
  goBackToBlocksList: () => void;
  goBackToActionsList: () => void;

  isBlockAuthSet: () => boolean;

  createNewBlockTool: () => AgentBlockTool | null;
  closeBlockDialog: () => void;
  resetDialogState: () => void;
}

const initialState = {
  showAddBlockDialog: false,
  selectedPage: 'pieces-list' as SelectedDialogPage,
  searchQuery: '',
  selectedBlock: undefined,
  selectedAction: undefined,
  predefinedInputs: undefined,
  editingBlockTool: undefined,
};

export const useBlockToolsDialogStore = create<BlocksToolDialogsState>(
  (set, get) => ({
    ...initialState,

    setSelectedPage: (page) => set({ selectedPage: page }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setPredefinedInputs: (inputs) => set({ predefinedInputs: inputs }),
    openAddBlockToolDialog: ({ page = 'pieces-list', tool, block }) => {
      set({
        showAddBlockDialog: true,
        selectedPage: page,
        editingBlockTool: tool,
        predefinedInputs: tool?.blockMetadata.predefinedInput,
        selectedBlock: block,
      });
    },
    handleBlockSelect: (block) => {
      set({
        selectedBlock: block,
        selectedPage: 'actions-list',
      });
    },
    handleActionSelect: (action) => {
      set({
        selectedAction: action,
        selectedPage: 'action-inputs',
      });
    },
    goBackToBlocksList: () => {
      set({
        selectedPage: 'pieces-list',
      });
      get().resetDialogState();
    },
    goBackToActionsList: () => {
      set({
        selectedPage: 'actions-list',
        selectedAction: undefined,
        predefinedInputs: undefined,
      });
    },
    isBlockAuthSet: () => {
      const { selectedBlock, selectedAction, predefinedInputs } = get();

      if (isNil(selectedBlock) || isNil(selectedAction)) {
        return false;
      }

      if (!selectedAction.requireAuth || isNil(selectedBlock.auth)) {
        return true;
      }

      if (!isNil(predefinedInputs?.auth)) {
        return true;
      }

      return false;
    },
    createNewBlockTool: () => {
      const {
        selectedAction,
        selectedBlock,
        predefinedInputs,
        isBlockAuthSet,
      } = get();

      if (!selectedAction || !selectedBlock || !isBlockAuthSet()) {
        return null;
      }

      return {
        type: AgentToolType.BLOCK,
        toolName: mcpToolNameUtils.createBlockToolName(
          selectedBlock.blockName,
          selectedAction.name,
        ),
        blockMetadata: {
          blockVersion: selectedBlock.blockVersion,
          blockName: selectedBlock.blockName,
          actionName: selectedAction.name,
          predefinedInput: predefinedInputs || undefined,
        },
      };
    },
    resetDialogState: () => {
      set({
        searchQuery: '',
        selectedBlock: undefined,
        selectedAction: undefined,
        predefinedInputs: undefined,
        editingBlockTool: undefined,
        selectedPage: 'pieces-list',
      });
    },
    closeBlockDialog: () => {
      set({ showAddBlockDialog: false });
      get().resetDialogState();
    },
  }),
);
