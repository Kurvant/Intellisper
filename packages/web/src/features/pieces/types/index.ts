import {
  ActionBase,
  ErrorHandlingOptionsParam,
  BlockAuthProperty,
  BlockMetadataModelSummary,
  TriggerBase,
} from '@intelblocks/blocks-framework';
import {
  FlowActionType,
  PackageType,
  BlockType,
  FlowTriggerType,
  FlowOperationType,
  StepLocationRelativeToParent,
} from '@intelblocks/shared';

type BaseStepMetadata = {
  displayName: string;
  logoUrl: string;
  description: string;
};

export type BlockStepMetadata = BaseStepMetadata & {
  type: FlowActionType.BLOCK | FlowTriggerType.BLOCK;
  blockName: string;
  blockVersion: string;
  categories: string[];
  packageType: PackageType;
  blockType: BlockType;
  auth: BlockAuthProperty | BlockAuthProperty[] | undefined;
  errorHandlingOptions?: ErrorHandlingOptionsParam;
};

export type PrimitiveStepMetadata = BaseStepMetadata & {
  type:
    | FlowActionType.CODE
    | FlowActionType.LOOP_ON_ITEMS
    | FlowActionType.ROUTER
    | FlowTriggerType.EMPTY;
};

export type BlockStepMetadataWithSuggestions = BlockStepMetadata &
  Pick<BlockMetadataModelSummary, 'suggestedActions' | 'suggestedTriggers'>;

export type StepMetadataWithSuggestions =
  | BlockStepMetadataWithSuggestions
  | PrimitiveStepMetadata;

export type CategorizedStepMetadataWithSuggestions = {
  title: string;
  metadata: StepMetadataWithSuggestions[];
};

export type StepMetadata = BlockStepMetadata | PrimitiveStepMetadata;

export type StepMetadataWithActionOrTriggerOrAgentDisplayName = StepMetadata & {
  actionOrTriggerOrAgentDisplayName: string;
  actionOrTriggerOrAgentDescription: string;
};

export type BlockSelectorOperation =
  | {
      type: FlowOperationType.ADD_ACTION;
      actionLocation: {
        branchIndex: number;
        parentStep: string;
        stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      };
    }
  | {
      type: FlowOperationType.ADD_ACTION;
      actionLocation: {
        parentStep: string;
        stepLocationRelativeToParent: Exclude<
          StepLocationRelativeToParent,
          StepLocationRelativeToParent.INSIDE_BRANCH
        >;
      };
    }
  | { type: FlowOperationType.UPDATE_TRIGGER }
  | {
      type: FlowOperationType.UPDATE_ACTION;
      stepName: string;
    };

export type BlockSelectorBlockItem =
  | {
      actionOrTrigger: TriggerBase;
      type: FlowTriggerType.BLOCK;
      blockMetadata: BlockStepMetadata;
    }
  | ({
      actionOrTrigger: ActionBase;
      type: FlowActionType.BLOCK;
      blockMetadata: BlockStepMetadata;
    } & {
      auth?: BlockAuthProperty;
    });

export type BlockSelectorItem = BlockSelectorBlockItem | PrimitiveStepMetadata;

export type HandleSelectActionOrTrigger = (item: BlockSelectorItem) => void;
