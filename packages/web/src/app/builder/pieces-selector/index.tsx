import { FlowOperationType, FlowTriggerType, isNil } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  CheckCircle2Icon,
  LayoutGridIcon,
  PuzzleIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { useDebounce } from 'use-debounce';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  BlocksSearchInput,
  BlockSelectorTabs,
  BlockSelectorTabsProvider,
  BlockSelectorTabType,
  BlockSelectorOperation,
  blockSelectorUtils,
  BlockSearchProvider,
  useBlockSearchContext,
} from '@/features/pieces';
import { aiProviderQueries } from '@/features/platform-admin';
import { platformHooks } from '@/hooks/platform-hooks';
import { useIsMobile } from '@/hooks/use-mobile';

import { AITabContent } from './ai-tab-content';
import { ApprovalsTabContent } from './approvals-tab-content';
import { ExploreTabContent } from './explore-tab-content';
import { BlocksCardList } from './pieces-card-list';

const getTabsList = (
  operationType: FlowOperationType,
  agentsEnabled: boolean,
) => {
  const baseTabs = [
    {
      value: BlockSelectorTabType.EXPLORE,
      name: t('Explore'),
      icon: <LayoutGridIcon className="size-5" />,
    },
    {
      value: BlockSelectorTabType.APPS,
      name: t('Apps'),
      icon: <PuzzleIcon className="size-5" />,
    },
    {
      value: BlockSelectorTabType.UTILITY,
      name: t('Utility'),
      icon: <WrenchIcon className="size-5" />,
    },
  ];

  const replaceOrAddAction = [
    FlowOperationType.ADD_ACTION,
    FlowOperationType.UPDATE_ACTION,
  ].includes(operationType);

  if (replaceOrAddAction && agentsEnabled) {
    baseTabs.splice(1, 0, {
      value: BlockSelectorTabType.AI_AND_AGENTS,
      name: t('AI & Agents'),
      icon: <SparklesIcon className="size-5" />,
    });
  }
  if (replaceOrAddAction) {
    baseTabs.push({
      value: BlockSelectorTabType.APPROVALS,
      name: t('Approvals'),
      icon: <CheckCircle2Icon className="size-5" />,
    });
  }
  return baseTabs;
};

type BlockSelectorProps = {
  children: React.ReactNode;
  id: string;
  operation: BlockSelectorOperation;
  openSelectorOnClick?: boolean;
  stepToReplaceBlockDisplayName?: string;
};

const BlockSelectorWrapper = (props: BlockSelectorProps) => {
  return (
    <BlockSearchProvider>
      <BlockSelectorContent {...props} />
    </BlockSearchProvider>
  );
};

const BlockSelectorContent = ({
  children,
  operation,
  id,
  openSelectorOnClick = true,
  stepToReplaceBlockDisplayName,
}: BlockSelectorProps) => {
  const [
    openedBlockSelectorStepNameOrAddButtonId,
    setOpenedBlockSelectorStepNameOrAddButtonId,
    setSelectedBlockMetadataInBlockSelector,
    isForEmptyTrigger,
    deselectStep,
  ] = useBuilderStateContext((state) => [
    state.openedBlockSelectorStepNameOrAddButtonId,
    state.setOpenedBlockSelectorStepNameOrAddButtonId,
    state.setSelectedBlockMetadataInBlockSelector,
    state.flowVersion.trigger.type === FlowTriggerType.EMPTY &&
      id === 'trigger',
    state.deselectStep,
  ]);
  const { searchQuery, setSearchQuery } = useBlockSearchContext();
  const isForReplace =
    operation.type === FlowOperationType.UPDATE_ACTION ||
    (operation.type === FlowOperationType.UPDATE_TRIGGER && !isForEmptyTrigger);
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const isOpen = openedBlockSelectorStepNameOrAddButtonId === id;
  const isMobile = useIsMobile();
  const { listHeightRef, popoverTriggerRef } =
    blockSelectorUtils.useAdjustBlockListHeightToAvailableSpace();
  const listHeight = Math.min(listHeightRef.current, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);
  const { data: aiProviders } = aiProviderQueries.useAiProviders();
  const clearSearch = () => {
    setSearchQuery('');
    setSelectedBlockMetadataInBlockSelector(null);
  };

  const { platform } = platformHooks.useCurrentPlatform();
  const tabsList = getTabsList(
    operation.type,
    platform.plan.agentsEnabled &&
      !isNil(aiProviders) &&
      aiProviders.length > 0,
  );

  return (
    <Popover
      open={isOpen}
      modal={true}
      onOpenChange={(open) => {
        if (!open) {
          clearSearch();
          setOpenedBlockSelectorStepNameOrAddButtonId(null);
          if (isForEmptyTrigger) {
            deselectStep();
          }
        }
      }}
    >
      <PopoverTrigger
        ref={popoverTriggerRef}
        asChild={true}
        onClick={() => {
          if (openSelectorOnClick) {
            setOpenedBlockSelectorStepNameOrAddButtonId(id);
          }
        }}
      >
        {children}
      </PopoverTrigger>

      <BlockSelectorTabsProvider
        initiallySelectedTab={
          isForReplace || isMobile
            ? BlockSelectorTabType.NONE
            : BlockSelectorTabType.EXPLORE
        }
        onTabChange={clearSearch}
        key={isOpen ? 'open' : 'closed'}
      >
        <PopoverContent
          onContextMenu={(e) => {
            e.stopPropagation();
          }}
          className="w-[340px] md:w-[600px] p-0 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <>
            <div>
              <BlocksSearchInput
                searchInputRef={searchInputRef}
                onSearchChange={(e) => {
                  setSelectedBlockMetadataInBlockSelector(null);
                  if (e === '') {
                    clearSearch();
                  }
                }}
              />
              {!isMobile && <BlockSelectorTabs tabs={tabsList} />}
              <Separator orientation="horizontal" className="mt-1" />
            </div>
            <div
              className=" flex flex-row max-h-[300px]"
              style={{
                height: listHeight + 'px',
              }}
            >
              <ExploreTabContent operation={operation} />
              <AITabContent operation={operation} />
              <ApprovalsTabContent operation={operation} />

              <BlocksCardList
                //this is done to avoid debounced results when user clears search
                searchQuery={searchQuery === '' ? '' : debouncedQuery}
                operation={operation}
                stepToReplaceBlockDisplayName={
                  isMobile ? undefined : stepToReplaceBlockDisplayName
                }
              />
            </div>
          </>
        </PopoverContent>
      </BlockSelectorTabsProvider>
    </Popover>
  );
};

export { BlockSelectorWrapper as BlockSelector };
