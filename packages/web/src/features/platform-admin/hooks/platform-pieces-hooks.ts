import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { platformApi } from '@/api/platforms-api';
import { blocksApi } from '@/features/pieces';

export const platformBlocksMutations = {
  useToggleBlockVisibility: ({
    platformId,
    filteredBlockNames,
    refetch,
  }: {
    platformId: string;
    filteredBlockNames: string[];
    refetch: () => Promise<void>;
  }) => {
    return useMutation({
      mutationFn: async (blockName: string) => {
        const newFilteredBlockNames = filteredBlockNames.includes(blockName)
          ? filteredBlockNames.filter((name) => name !== blockName)
          : [...filteredBlockNames, blockName];
        await platformApi.update(
          { filteredBlockNames: newFilteredBlockNames },
          platformId,
        );
        await refetch();
      },
      onSuccess: () => {
        toast.success(t('Your changes have been saved.'), { duration: 3000 });
      },
    });
  },
  useToggleBlockPin: ({
    platformId,
    pinnedBlocks,
    refetch,
  }: {
    platformId: string;
    pinnedBlocks: string[];
    refetch: () => Promise<void>;
  }) => {
    return useMutation({
      mutationFn: async (blockName: string) => {
        const newPinnedBlocks = pinnedBlocks.includes(blockName)
          ? pinnedBlocks.filter((name) => name !== blockName)
          : [...pinnedBlocks, blockName];
        await platformApi.update({ pinnedBlocks: newPinnedBlocks }, platformId);
        await refetch();
      },
      onSuccess: () => {
        toast.success(t('Your changes have been saved.'), { duration: 3000 });
      },
    });
  },
  useSyncBlocks: () => {
    return useMutation({
      mutationFn: async () => {
        await blocksApi.syncFromCloud();
      },
      onSuccess: () => {
        toast.success(t('Blocks synced'), {
          description: t('Blocks have been synced from the Intellisper cloud.'),
        });
      },
    });
  },
};
