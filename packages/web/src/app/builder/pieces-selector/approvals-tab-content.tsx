import { FlowActionType, FlowOperationType, isNil } from '@intelblocks/shared';
import { useMemo } from 'react';

import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import {
  blocksHooks,
  BlockSelectorTabType,
  useBlockSelectorTabs,
  BlockSelectorOperation,
  stepUtils,
} from '@/features/pieces';

import { useBuilderStateContext } from '../builder-hooks';

import GenericActionOrTriggerItem from './generic-piece-selector-item';

const APPROVAL_PIECES_CONFIG = [
  {
    blockName: '@intelblocks/block-slack',
    approvalActionNames: [
      'request_approval_message',
      'request_approval_direct_message',
    ],
  },
  {
    blockName: '@intelblocks/block-discord',
    approvalActionNames: ['request_approval_message'],
  },
  {
    blockName: '@intelblocks/block-microsoft-teams',
    approvalActionNames: [
      'request_approval_direct_message',
      'request_approval_in_channel',
    ],
  },
  {
    blockName: '@intelblocks/block-microsoft-outlook',
    approvalActionNames: ['request_approval_in_mail'],
  },
  {
    blockName: '@intelblocks/block-gmail',
    approvalActionNames: ['request_approval_in_mail'],
  },
  {
    blockName: '@intelblocks/block-telegram-bot',
    approvalActionNames: ['request_approval_message'],
  },
];

const ApprovalsTabContent = ({
  operation,
}: {
  operation: BlockSelectorOperation;
}) => {
  const { selectedTab } = useBlockSelectorTabs();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);

  // The config above lists *preferred* approval blocks; it is not a guarantee that a
  // deployment's catalog contains them. Intersect with the catalog before fetching
  // details, otherwise every absent block issues a request that (correctly) 404s.
  const { blocks: catalog, isLoading: isLoadingCatalog } = blocksHooks.useBlocks(
    {},
  );
  const availableBlockNames = useMemo(() => {
    if (isNil(catalog)) {
      return [];
    }
    const catalogNames = new Set(catalog.map((block) => block.name));
    return APPROVAL_PIECES_CONFIG.map((config) => config.blockName).filter(
      (blockName) => catalogNames.has(blockName),
    );
  }, [catalog]);

  const blockQueries = blocksHooks.useMultipleBlocks({
    names: availableBlockNames,
  });

  // Render whatever resolved. A block that fails to load is skipped, never fatal.
  const isLoading =
    isLoadingCatalog || blockQueries.some((query) => query.isLoading);

  if (
    selectedTab !== BlockSelectorTabType.APPROVALS ||
    ![FlowOperationType.ADD_ACTION, FlowOperationType.UPDATE_ACTION].includes(
      operation.type,
    )
  ) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 w-full p-2">
        <CardListItemSkeleton numberOfCards={3} withCircle={false} />
      </div>
    );
  }

  const allApprovalActions = blockQueries.flatMap((query) => {
    if (!query.data) return [];

    const config = APPROVAL_PIECES_CONFIG.find(
      (config) => config.blockName === query.data.name,
    );
    if (isNil(config)) return [];
    const blockMetadata = stepUtils.mapBlockToMetadata({
      block: query.data,
      type: 'action',
    });

    return config.approvalActionNames
      .map((actionName) => {
        const action = query.data.actions[actionName];
        if (!action) return null;
        return {
          action,
          blockMetadata,
        };
      })
      .filter((item) => !isNil(item));
  });

  return (
    <CardList listClassName="gap-0">
      {allApprovalActions.map((item) => (
        <GenericActionOrTriggerItem
          key={`${item.blockMetadata.blockName}-${item.action.name}`}
          item={{
            actionOrTrigger: item.action,
            type: FlowActionType.BLOCK,
            blockMetadata: item.blockMetadata,
          }}
          hideBlockIconAndDescription={false}
          stepMetadataWithSuggestions={{
            ...item.blockMetadata,
            suggestedActions: [item.action],
            suggestedTriggers: [],
          }}
          onClick={() => {
            handleAddingOrUpdatingStep({
              blockSelectorItem: {
                actionOrTrigger: item.action,
                type: FlowActionType.BLOCK,
                blockMetadata: item.blockMetadata,
              },
              operation,
              selectStepAfter: true,
            });
          }}
        />
      ))}
    </CardList>
  );
};

export { ApprovalsTabContent };
