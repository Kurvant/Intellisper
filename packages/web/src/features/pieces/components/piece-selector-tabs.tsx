import React from 'react';

import { Tabs, TabsTrigger, TabsList } from '@/components/ui/tabs';

import {
  BlockSelectorTabType,
  useBlockSelectorTabs,
} from '../stores/piece-selector-tabs-provider';

type TabType = {
  value: BlockSelectorTabType;
  name: string;
  icon: React.ReactNode;
};

export const BlockSelectorTabs = ({ tabs }: { tabs: TabType[] }) => {
  const { selectedTab, setSelectedTab } = useBlockSelectorTabs();
  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) => setSelectedTab(value as BlockSelectorTabType)}
      className="w-full"
    >
      <TabsList
        className={`h-full w-full flex gap-3 px-2  justify-start rounded-none bg-background`}
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={`flex flex-col  grow  h-full rounded-md  w-[85px] max-w-[85px] shrink-0
              hover:bg-gray-300/30 dark:hover:bg-gray-300/10
               data-[state=active]:text-primary data-[state=active]:shadow-none
               border-transparent data-[state=active]:border-primary data-[state=active]:active data-[state=active]:bg-transparent
               text-accent-foreground [&>svg]:size-5 [&>svg]:shrink-0`}
          >
            {tab.icon}
            <span className="mt-1.5 text-sm">{tab.name}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
