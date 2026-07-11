import {
  BlockCategory,
  FlowTriggerType,
  FlowActionType,
  AI_BLOCK_NAME,
} from '@intelblocks/shared';
import { t } from 'i18next';

import {
  CategorizedStepMetadataWithSuggestions,
  BlockStepMetadataWithSuggestions,
  StepMetadata,
  StepMetadataWithSuggestions,
} from '@/features/pieces/types';

const isFlowController = (stepMetadata: StepMetadata) => {
  if (
    stepMetadata.type === FlowActionType.BLOCK ||
    stepMetadata.type === FlowTriggerType.BLOCK
  ) {
    return stepMetadata.categories.includes(BlockCategory.FLOW_CONTROL);
  }
  return (
    stepMetadata.type === FlowActionType.LOOP_ON_ITEMS ||
    stepMetadata.type === FlowActionType.ROUTER
  );
};

const getAiAndAgentsBlocks = (queryResult: StepMetadataWithSuggestions[]) => {
  const res: CategorizedStepMetadataWithSuggestions[] = [];
  const blocks = filterResultByBlockType(queryResult);
  const aiAndAgentsBlocks = blocks.filter(isAiAndAgentBlock);
  const recommendedCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Recommended'),
    metadata: [],
  };
  const othersCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Others'),
    metadata: [],
  };
  const recommendedBlocks = aiAndAgentsBlocks.filter((block) =>
    block.categories.includes(BlockCategory.UNIVERSAL_AI),
  );
  if (recommendedBlocks.length > 0) {
    recommendedCategory.metadata = recommendedBlocks;
    res.push(recommendedCategory);
  }
  const otherBlocks = aiAndAgentsBlocks.filter(
    (block) => !recommendedBlocks.includes(block),
  );
  if (otherBlocks.length > 0) {
    othersCategory.metadata = otherBlocks;
    res.push(othersCategory);
  }
  return res;
};

const isAiAndAgentBlock = (stepMetadata: StepMetadata) => {
  if (
    stepMetadata.type === FlowActionType.BLOCK ||
    stepMetadata.type === FlowTriggerType.BLOCK
  ) {
    return stepMetadata.categories.some((category) =>
      [
        BlockCategory.UNIVERSAL_AI,
        BlockCategory.ARTIFICIAL_INTELLIGENCE,
      ].includes(category as BlockCategory),
    );
  }
  return false;
};

const isUtilityBlock = (metadata: StepMetadata) =>
  metadata.type !== FlowTriggerType.BLOCK &&
  metadata.type !== FlowActionType.BLOCK
    ? !isFlowController(metadata)
    : metadata.categories.includes(BlockCategory.CORE) &&
      !isFlowController(metadata);

const isAppBlock = (metadata: StepMetadata) => {
  return (
    !isUtilityBlock(metadata) &&
    !isAiAndAgentBlock(metadata) &&
    !isFlowController(metadata)
  );
};

const getPinnedBlocks = (
  queryResult: StepMetadataWithSuggestions[],
  pinnedBlocksNames: string[],
) => {
  const blocks = filterResultByBlockType(queryResult);
  const pinnedBlocks = blocks.filter((block) =>
    pinnedBlocksNames.includes(block.blockName),
  );
  return sortByBlockNameOrder(pinnedBlocks, pinnedBlocksNames);
};

const POPULAR_PIECES_NAMES = [
  '@intelblocks/block-google-sheets',
  '@intelblocks/block-slack',
  '@intelblocks/block-notion',
  '@intelblocks/block-gmail',
  '@intelblocks/block-hubspot',
  '@intelblocks/block-openai',
  '@intelblocks/block-google-forms',
  '@intelblocks/block-google-drive',
  '@intelblocks/block-google-docs',
];
const getPopularBlocks = (
  queryResult: StepMetadataWithSuggestions[],
  pinnedBlocksNames: string[],
) => {
  const blocks = filterResultByBlockType(queryResult);
  const popularBlocks = blocks.filter(
    (block) =>
      POPULAR_PIECES_NAMES.includes(block.blockName) &&
      !pinnedBlocksNames.includes(block.blockName),
  );
  return sortByBlockNameOrder(popularBlocks, POPULAR_PIECES_NAMES);
};

const filterResultByBlockType = (
  queryResult: StepMetadataWithSuggestions[],
) => {
  return queryResult.filter(
    (block): block is BlockStepMetadataWithSuggestions =>
      block.type === FlowActionType.BLOCK ||
      block.type === FlowTriggerType.BLOCK,
  );
};

const getHighlightedBlocks = (
  queryResult: StepMetadataWithSuggestions[],
  type: 'action' | 'trigger',
) => {
  const blocks = filterResultByBlockType(queryResult);
  const highlightedBlocksNames =
    type === 'action'
      ? HIGHLIGHTED_PIECES_NAMES_FOR_ACTIONS
      : HIGHLIGHTED_PIECES_NAMES_FOR_TRIGGERS;
  const highlightedBlocks = blocks.filter((block) =>
    highlightedBlocksNames.includes(block.blockName),
  );
  return sortByBlockNameOrder(
    highlightedBlocks,
    type === 'action'
      ? HIGHLIGHTED_PIECES_NAMES_FOR_ACTIONS
      : HIGHLIGHTED_PIECES_NAMES_FOR_TRIGGERS,
  );
};
const sortByBlockNameOrder = (
  searchResult: StepMetadataWithSuggestions[],
  orderNames: string[],
): StepMetadataWithSuggestions[] => {
  const blocks = filterResultByBlockType(searchResult);
  return blocks.sort((a, b) => {
    return orderNames.indexOf(a.blockName) - orderNames.indexOf(b.blockName);
  });
};
const HIGHLIGHTED_PIECES_NAMES_FOR_TRIGGERS = [
  '@intelblocks/block-webhook',
  '@intelblocks/block-schedule',
  '@intelblocks/block-manual-trigger',
  '@intelblocks/block-forms',
  '@intelblocks/block-tables',
];

const HIGHLIGHTED_PIECES_NAMES_FOR_ACTIONS = [
  AI_BLOCK_NAME,
  '@intelblocks/block-http',
  '@intelblocks/block-tables',
  '@intelblocks/block-forms',
  '@intelblocks/block-webhook',
  '@intelblocks/block-text-helper',
  '@intelblocks/block-date-helper',
];

export const blockSearchUtils = {
  isFlowController,
  getAiAndAgentsBlocks,
  isAiAndAgentBlock,
  isUtilityBlock,
  isAppBlock,
  getPinnedBlocks,
  getPopularBlocks,
  getHighlightedBlocks,
};
