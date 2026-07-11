import {
  BlockAuthProperty,
  BlockPropertyMap,
  blockPropertiesUtils,
} from '@intelblocks/blocks-framework';
import {
  FlowAction,
  FlowActionType,
  BranchOperator,
  CodeAction,
  BlockAction,
  BlockTrigger,
  FlowTrigger,
  deepMergeAndCast,
  BranchExecutionType,
  RouterExecutionType,
  isNil,
  flowStructureUtil,
  StepSettings,
  RouterActionSettingsWithValidation,
  FlowTriggerType,
  PropertyExecutionType,
  DEFAULT_SAMPLE_DATA_SETTINGS,
  FlowVersion,
  FlowOperationType,
  isManualBlockTrigger,
  AUTHENTICATION_PROPERTY_NAME,
} from '@intelblocks/shared';
import { useRef } from 'react';

import {
  BlockSelectorItem,
  BlockSelectorOperation,
  BlockSelectorBlockItem,
  BlockStepMetadataWithSuggestions,
} from '@/features/pieces/types';

import { formUtils } from './form-utils';
const defaultCode = `export const code = async (inputs) => {
  return true;
};`;

const removeHiddenActions = (
  blockMetadata: BlockStepMetadataWithSuggestions,
) => {
  const actions = Object.values(blockMetadata.suggestedActions ?? {});
  return actions;
};

const isBlockActionOrTrigger = (
  blockSelectorItem: BlockSelectorItem,
): blockSelectorItem is BlockSelectorBlockItem => {
  return (
    blockSelectorItem.type === FlowActionType.BLOCK ||
    (flowStructureUtil.isTrigger(blockSelectorItem.type) &&
      blockSelectorItem.type === FlowTriggerType.BLOCK)
  );
};

const isBlockStepInputValid = ({
  props,
  auth,
  input,
  requireAuth,
}: {
  props: BlockPropertyMap;
  auth: BlockAuthProperty | BlockAuthProperty[] | undefined;
  input: Record<string, unknown>;
  requireAuth: boolean;
}): boolean => {
  const schema = blockPropertiesUtils.buildSchema(props, auth);
  const hasAuth = !isNil(auth);
  const authValid =
    !requireAuth || !hasAuth || !isNil(input[AUTHENTICATION_PROPERTY_NAME]);
  return schema.safeParse(input).success && authValid;
};

const isStepInitiallyValid = (
  blockSelectorItem: BlockSelectorItem,
  overrideDefaultSettings?: StepSettings,
) => {
  switch (blockSelectorItem.type) {
    case FlowActionType.CODE:
      return true;
    case FlowActionType.BLOCK:
    case FlowTriggerType.BLOCK: {
      const overridingInput =
        overrideDefaultSettings && 'input' in overrideDefaultSettings
          ? overrideDefaultSettings.input
          : undefined;
      const input = overridingInput ?? getInitalStepInput(blockSelectorItem);
      return isBlockStepInputValid({
        props: blockSelectorItem.actionOrTrigger.props,
        auth: blockSelectorItem.blockMetadata.auth,
        input,
        requireAuth: blockSelectorItem.actionOrTrigger.requireAuth,
      });
    }
    case FlowActionType.LOOP_ON_ITEMS: {
      if (
        overrideDefaultSettings &&
        'input' in overrideDefaultSettings &&
        overrideDefaultSettings.input.items
      ) {
        return true;
      }
      return false;
    }
    case FlowTriggerType.EMPTY: {
      return false;
    }
    case FlowActionType.ROUTER: {
      if (overrideDefaultSettings) {
        return RouterActionSettingsWithValidation.safeParse(
          overrideDefaultSettings,
        ).success;
      }
      return false;
    }
  }
};

const getInitalStepInput = (blockSelectorItem: BlockSelectorItem) => {
  if (!isBlockActionOrTrigger(blockSelectorItem)) {
    return {};
  }
  return formUtils.getDefaultValueForProperties({
    props: {
      ...blockSelectorItem.actionOrTrigger.props,
    },
    existingInput: {},
  });
};

const getDefaultStepValues = ({
  stepName,
  blockSelectorItem,
  overrideDefaultSettings,
  customLogoUrl,
}: {
  stepName: string;
  blockSelectorItem: BlockSelectorItem;
  overrideDefaultSettings?: StepSettings;
  customLogoUrl?: string;
}): FlowAction | FlowTrigger => {
  const errorHandlingOptions: CodeAction['settings']['errorHandlingOptions'] = {
    continueOnFailure: {
      value: false,
    },
    retryOnFailure: {
      value: false,
    },
  };

  const input = getInitalStepInput(blockSelectorItem);
  const isValid = isStepInitiallyValid(
    blockSelectorItem,
    overrideDefaultSettings,
  );
  const common = {
    name: stepName,
    valid: isValid,
    displayName: isBlockActionOrTrigger(blockSelectorItem)
      ? blockSelectorItem.actionOrTrigger.displayName
      : blockSelectorItem.displayName,
    skip: false,
    settings: {
      customLogoUrl,
      sampleData: DEFAULT_SAMPLE_DATA_SETTINGS,
    },
  };

  switch (blockSelectorItem.type) {
    case FlowActionType.CODE:
      return deepMergeAndCast<CodeAction>(
        {
          type: FlowActionType.CODE,
          settings: overrideDefaultSettings ?? {
            sourceCode: {
              code: defaultCode,
              packageJson: '{}',
            },
            input,
            errorHandlingOptions,
          },
        },
        common,
      );
    case FlowActionType.LOOP_ON_ITEMS:
      return deepMergeAndCast<FlowAction>(
        {
          type: FlowActionType.LOOP_ON_ITEMS,
          settings: overrideDefaultSettings ?? {
            items: '',
          },
        },
        common,
      );
    case FlowActionType.ROUTER:
      return deepMergeAndCast<FlowAction>(
        {
          type: FlowActionType.ROUTER,
          settings: overrideDefaultSettings ?? {
            executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            branches: [
              {
                conditions: [
                  [
                    {
                      operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                      firstValue: '',
                      secondValue: '',
                      caseSensitive: false,
                    },
                  ],
                ],
                branchType: BranchExecutionType.CONDITION,
                branchName: 'Branch 1',
              },
              {
                branchType: BranchExecutionType.FALLBACK,
                branchName: 'Otherwise',
              },
            ],
          },
          children: [null, null],
        },
        common,
      );
    case FlowActionType.BLOCK: {
      if (!isBlockActionOrTrigger(blockSelectorItem)) {
        throw new Error(
          `Invalid piece selector item ${JSON.stringify(blockSelectorItem)}`,
        );
      }
      return deepMergeAndCast<BlockAction>(
        {
          type: FlowActionType.BLOCK,
          settings: overrideDefaultSettings ?? {
            blockName: blockSelectorItem.blockMetadata.blockName,
            actionName: blockSelectorItem.actionOrTrigger.name,
            blockVersion: blockSelectorItem.blockMetadata.blockVersion,
            input,
            errorHandlingOptions,
            propertySettings: Object.fromEntries(
              Object.entries(input).map(([key]) => [
                key,
                {
                  type: PropertyExecutionType.MANUAL,
                  schema: undefined,
                },
              ]),
            ),
          },
        },
        common,
      );
    }
    case FlowTriggerType.BLOCK: {
      if (!isBlockActionOrTrigger(blockSelectorItem)) {
        throw new Error(
          `Invalid piece selector item ${JSON.stringify(blockSelectorItem)}`,
        );
      }
      return deepMergeAndCast<BlockTrigger>(
        {
          type: FlowTriggerType.BLOCK,
          settings: overrideDefaultSettings ?? {
            blockName: blockSelectorItem.blockMetadata.blockName,
            triggerName: blockSelectorItem.actionOrTrigger.name,
            blockVersion: blockSelectorItem.blockMetadata.blockVersion,
            input,
            propertySettings: Object.fromEntries(
              Object.entries(input).map(([key]) => [
                key,
                {
                  type: PropertyExecutionType.MANUAL,
                },
              ]),
            ),
          },
        },
        common,
      );
    }
    default:
      throw new Error('Unsupported type: ' + blockSelectorItem.type);
  }
};

// Adjusts piece list height to prevent overflow on short screens
const useAdjustBlockListHeightToAvailableSpace = () => {
  const listHeightRef = useRef<number>(MAX_PIECE_SELECTOR_LIST_HEIGHT);
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (!popoverTriggerRef.current) {
    return {
      listHeightRef,
      popoverTriggerRef,
      searchInputDivHeight: SEARCH_INPUT_DIV_HEIGHT,
    };
  }

  const popOverTriggerRect = popoverTriggerRef.current.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const shouldRenderBelowPopoverTrigger =
    popOverTriggerRect.top < viewportHeight - popOverTriggerRect.bottom;

  if (shouldRenderBelowPopoverTrigger) {
    const availableSpaceBelow =
      viewportHeight - popOverTriggerRect.bottom - SEARCH_INPUT_DIV_HEIGHT;
    listHeightRef.current = Math.max(
      MIN_PIECE_SELECTOR_LIST_HEIGHT,
      availableSpaceBelow,
    );
  } else {
    const availableSpaceAbove =
      popOverTriggerRect.top - SEARCH_INPUT_DIV_HEIGHT;
    listHeightRef.current = Math.max(
      MIN_PIECE_SELECTOR_LIST_HEIGHT,
      availableSpaceAbove,
    );
  }

  return {
    listHeightRef,
    popoverTriggerRef,
  };
};
const MAX_PIECE_SELECTOR_LIST_HEIGHT = 300 as const;
const MIN_PIECE_SELECTOR_LIST_HEIGHT = 100 as const;
const SEARCH_INPUT_DIV_HEIGHT = 113 as const;
const PIECE_ITEM_HEIGHT = 48 as const;
const ACTION_OR_TRIGGER_ITEM_HEIGHT = 41 as const;
const CATEGORY_ITEM_HEIGHT = 28 as const;
export const PIECE_SELECTOR_ELEMENTS_HEIGHTS = {
  MAX_PIECE_SELECTOR_LIST_HEIGHT,
  MIN_PIECE_SELECTOR_LIST_HEIGHT,
  SEARCH_INPUT_DIV_HEIGHT,
  PIECE_ITEM_HEIGHT,
  ACTION_OR_TRIGGER_ITEM_HEIGHT,
  CATEGORY_ITEM_HEIGHT,
};

const isMcpToolTrigger = (blockName: string, triggerName: string) => {
  return blockName === '@intelblocks/block-mcp' && triggerName === 'mcp_tool';
};

const isChatTrigger = (blockName: string, triggerName: string) => {
  return (
    blockName === '@intelblocks/block-forms' &&
    triggerName === 'chat_submission'
  );
};

const getStepNameFromOperationType = (
  operation: BlockSelectorOperation,
  flowVersion: FlowVersion,
) => {
  switch (operation.type) {
    case FlowOperationType.UPDATE_ACTION:
      return operation.stepName;
    case FlowOperationType.ADD_ACTION:
      return flowStructureUtil.findUnusedName(flowVersion.trigger);
    case FlowOperationType.UPDATE_TRIGGER:
      return 'trigger';
  }
};
export const blockSelectorUtils = {
  getDefaultStepValues,
  useAdjustBlockListHeightToAvailableSpace,
  isBlockStepInputValid,
  isMcpToolTrigger,
  isChatTrigger,
  removeHiddenActions,
  getStepNameFromOperationType,
  isManualTrigger: isManualBlockTrigger,
};
