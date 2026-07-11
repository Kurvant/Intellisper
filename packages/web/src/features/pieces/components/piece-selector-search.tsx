import { t } from 'i18next';
import { ArrowLeftIcon } from 'lucide-react';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { useBlockSearchContext } from '@/features/pieces/stores/piece-search-context';
import {
  BlockSelectorTabType,
  useBlockSelectorTabs,
} from '@/features/pieces/stores/piece-selector-tabs-provider';

type BlocksSearchInputProps = {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
};

const BlocksSearchInput = ({
  searchInputRef,
  onSearchChange,
}: BlocksSearchInputProps) => {
  const { searchQuery, setSearchQuery } = useBlockSearchContext();
  const {
    resetToBeforeNoneWasSelected: resetToPreviousValue,
    setSelectedTab,
    selectedBlockInExplore,
    selectedTab,
    setSelectedBlockInExplore,
  } = useBlockSelectorTabs();
  const showBackButton =
    selectedBlockInExplore && selectedTab === BlockSelectorTabType.EXPLORE;
  return (
    <div className="p-2 flex gap-2 items-center">
      {showBackButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedBlockInExplore(null);
          }}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}
      <SearchInput
        placeholder={t('Search')}
        value={searchQuery}
        data-testid="pieces-search-input"
        ref={searchInputRef}
        onChange={(e) => {
          setSearchQuery(e);
          onSearchChange(e);
          if (e === '') {
            resetToPreviousValue();
          } else {
            setSelectedTab(BlockSelectorTabType.NONE);
          }
        }}
      />
    </div>
  );
};
BlocksSearchInput.displayName = 'BlocksSearchInput';
export { BlocksSearchInput };
