import { createContext, useContext, useState } from 'react';

import { StepMetadataWithSuggestions } from '@/features/pieces/types';

export enum BlockSelectorTabType {
  EXPLORE = 'EXPLORE',
  AI_AND_AGENTS = 'AI_AND_AGENTS',
  APPROVALS = 'APPROVALS',
  APPS = 'APPS',
  UTILITY = 'UTILITY',
  NONE = 'NONE',
}

export const BlockSelectorTabsContext = createContext({
  selectedTab: BlockSelectorTabType.EXPLORE,
  setSelectedTab: (_tab: BlockSelectorTabType) => {},
  resetToBeforeNoneWasSelected: () => {},
  setSelectedBlockInExplore: (_block: StepMetadataWithSuggestions | null) => {},
  selectedBlockInExplore: null as null | StepMetadataWithSuggestions,
});

export const BlockSelectorTabsProvider = ({
  children,
  onTabChange,
  initiallySelectedTab,
}: {
  children: React.ReactNode;
  onTabChange: (tab: BlockSelectorTabType) => void;
  initiallySelectedTab: BlockSelectorTabType;
}) => {
  const [selectedTab, setSelectedTab] = useState(initiallySelectedTab);
  const [lastTabBefroeNoneWasSelected, setLastTabBeforeNoneWasSelected] =
    useState(initiallySelectedTab);
  const [selectedBlockInExplore, setSelectedBlockInExplore] =
    useState<StepMetadataWithSuggestions | null>(null);
  return (
    <BlockSelectorTabsContext.Provider
      value={{
        selectedTab,
        setSelectedBlockInExplore,
        selectedBlockInExplore,
        setSelectedTab: (tab: BlockSelectorTabType) => {
          if (tab !== BlockSelectorTabType.NONE) {
            setLastTabBeforeNoneWasSelected(tab);
            onTabChange(tab);
          }
          setSelectedTab(tab);
        },
        resetToBeforeNoneWasSelected: () => {
          setSelectedTab(lastTabBefroeNoneWasSelected);
        },
      }}
    >
      {children}
    </BlockSelectorTabsContext.Provider>
  );
};

export const useBlockSelectorTabs = () => {
  const context = useContext(BlockSelectorTabsContext);
  if (!context) {
    throw new Error(
      'usePieceSelectorTabs must be used within a BlockSelectorTabsProvider',
    );
  }
  return context;
};
