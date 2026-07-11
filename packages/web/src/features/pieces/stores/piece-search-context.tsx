import { createContext, useContext, useState } from 'react';

export type BlockSearchContextState = {
  searchQuery: string;
  setSearchQuery: (searchQuery: string) => void;
};

const BlockSearchContext = createContext<BlockSearchContextState>({
  searchQuery: '',
  setSearchQuery: () => {},
});

export const BlockSearchProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  return (
    <BlockSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      {children}
    </BlockSearchContext.Provider>
  );
};

export const useBlockSearchContext = () => useContext(BlockSearchContext);
