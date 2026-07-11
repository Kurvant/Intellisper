import { Tag } from '@intelblocks/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { blocksTagsApi } from '../api/pieces-tags';

export const blocksTagKeys = {
  all: ['tags'] as const,
};

export const blocksTagQueries = {
  useTags: () =>
    useQuery({
      queryKey: blocksTagKeys.all,
      queryFn: async () => {
        const response = await blocksTagsApi.list({ limit: 100 });
        return response.data;
      },
    }),
};

export const blocksTagMutations = {
  useDeleteTag: ({ onSuccess }: { onSuccess: () => void }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => blocksTagsApi.delete(id),
      onSuccess: () => {
        toast.success(t('Tag deleted'));
        queryClient.invalidateQueries({ queryKey: blocksTagKeys.all });
        queryClient.invalidateQueries({ queryKey: ['pieces'] });
        onSuccess();
      },
    });
  },
  useApplyTags: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation({
      mutationFn: async ({ blocksName, tags }: ApplyTagsParams) => {
        await blocksTagsApi.tagBlocks({ blocksName, tags });
      },
      onSuccess: () => {
        toast(t('Tags applied.'), {});
        onSuccess();
      },
    });
  },
  useCreateTag: ({
    onTagCreated,
    setIsOpen,
  }: {
    onTagCreated: (tag: Tag) => void;
    setIsOpen: (open: boolean) => void;
  }) => {
    return useMutation({
      mutationFn: (name: string) => blocksTagsApi.upsert({ name }),
      onSuccess: (data) => {
        toast.success(t('Tag created'), {
          description: t(`Tag "${data.name}" has been created successfully.`),
        });
        onTagCreated(data);
        setIsOpen(false);
      },
    });
  },
};

type ApplyTagsParams = {
  blocksName: string[];
  tags: string[];
};
