import {
  BlockMetadataModel,
  BlockMetadataModelSummary,
  PropertyType,
  ExecutePropsResult,
} from '@intelblocks/blocks-framework';
import {
  AddBlockRequestBody,
  IbEdition,
  FlowActionType,
  flowBlockUtil,
  LocalesEnum,
  BlockOptionRequest,
  PlatformWithoutSensitiveData,
  FlowTriggerType,
  IbFlagId,
  TelemetryEventName,
} from '@intelblocks/shared';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import semver from 'semver';

import { useTelemetry } from '@/components/providers/telemetry-provider';
import { appConnectionsApi } from '@/features/connections/api/app-connections';
import {
  StepMetadataWithSuggestions,
  CategorizedStepMetadataWithSuggestions,
} from '@/features/pieces/types';
import { flagsHooks } from '@/hooks/flags-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { blocksApi } from '../api/pieces-api';
import {
  BlockSelectorTabType,
  useBlockSelectorTabs,
} from '../stores/piece-selector-tabs-provider';
import { blockSearchUtils } from '../utils/piece-search-utils';

import { stepsHooks } from './steps-hooks';

const {
  getPinnedBlocks,
  getPopularBlocks,
  getAiAndAgentsBlocks,
  isUtilityBlock,
  isAppBlock,
  getHighlightedBlocks,
  isFlowController,
} = blockSearchUtils;

type UseBlockModelForStepSettings = {
  name: string;
  version: string | undefined;
  enabled?: boolean;
};

type UseBlockProps = {
  name: string;
  version?: string;
  enabled?: boolean;
};

type UseMultipleBlocksProps = {
  names: string[];
};

type UseBlocksProps = {
  searchQuery?: string;
  includeHidden?: boolean;
  includeTags?: boolean;
  isTableQuery?: boolean;
};
type UseBlocksSearchProps = {
  searchQuery: string;
  enabled?: boolean;
  type: 'action' | 'trigger';
  shouldCaptureEvent: boolean;
};

export const blocksHooks = {
  useBlock: ({ name, version, enabled = true }: UseBlockProps) => {
    const { i18n } = useTranslation();
    const query = useQuery<BlockMetadataModel, Error>({
      queryKey: ['piece', name, version],
      queryFn: () =>
        blocksApi.get({ name, version, locale: i18n.language as LocalesEnum }),
      staleTime: Infinity,
      enabled,
    });
    return {
      blockModel: query.data,
      isLoading: query.isLoading,
      isSuccess: query.isSuccess,
      refetch: query.refetch,
    };
  },
  useBlockModelForStepSettings: ({
    name,
    version,
    enabled = true,
  }: UseBlockModelForStepSettings) => {
    const exactVersion = version
      ? flowBlockUtil.getExactVersion(version)
      : undefined;
    const blockQuery = blocksHooks.useBlock({
      name,
      version: exactVersion,
      enabled,
    });
    return {
      blockModel: blockQuery.blockModel,
      isLoading: blockQuery.isLoading,
      isSuccess: blockQuery.isSuccess,
      refetch: blockQuery.refetch,
    };
  },
  useMultipleBlocks: ({ names }: UseMultipleBlocksProps) => {
    const { i18n } = useTranslation();
    return useQueries({
      queries: names.map((name) => ({
        queryKey: ['piece', name, undefined],
        queryFn: () =>
          blocksApi.get({
            name,
            version: undefined,
            locale: i18n.language as LocalesEnum,
          }),
        staleTime: Infinity,
      })),
    });
  },
  useBlockSummariesByNames: ({ names }: UseMultipleBlocksProps) => {
    const { blocks, isLoading } = blocksHooks.useBlocks({});
    const summaries = useMemo(() => {
      if (!blocks) return [];
      const byName = new Map(blocks.map((p) => [p.name, p]));
      return names
        .map((name) => byName.get(name))
        .filter((p): p is BlockMetadataModelSummary => !!p);
    }, [blocks, names]);
    return { summaries, isLoading };
  },
  useBlockSummary: ({ name }: { name: string }) => {
    const { blocks, isLoading } = blocksHooks.useBlocks({});
    const summary = useMemo(
      () => blocks?.find((p) => p.name === name),
      [blocks, name],
    );
    return { summary, isLoading };
  },
  useBlocks: ({
    searchQuery,
    includeHidden = false,
    includeTags = false,
    isTableQuery = false,
  }: UseBlocksProps) => {
    const { i18n } = useTranslation();
    const query = useQuery<BlockMetadataModelSummary[], Error>({
      queryKey: [
        isTableQuery ? 'pieces-table' : 'pieces',
        searchQuery,
        includeHidden,
      ],
      queryFn: () =>
        blocksApi.list({
          projectId: authenticationSession.getProjectId()!,
          searchQuery,
          includeHidden,
          includeTags,
          locale: i18n.language as LocalesEnum,
        }),
      staleTime: searchQuery ? 0 : Infinity,
      meta: isTableQuery
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
    });
    return {
      blocks: query.data,
      isLoading: query.isLoading,
      refetch: query.refetch,
    };
  },
  useBlocksSearch: (
    props: UseBlocksSearchProps,
  ): {
    isLoading: boolean;
    data: CategorizedStepMetadataWithSuggestions[];
  } => {
    const { selectedTab } = useBlockSelectorTabs();
    const { capture } = useTelemetry();
    const { metadata, isLoading: isLoadingBlocks } =
      stepsHooks.useAllStepsMetadata(props);
    const { platform } = platformHooks.useCurrentPlatform();
    if (!metadata || isLoadingBlocks) {
      return {
        isLoading: true,
        data: [],
      };
    }
    const blocksMetadataWithoutEmptySuggestions =
      filterOutBlocksWithNoSuggestions(metadata);

    const pinnedBlocks = getPinnedBlocks(
      blocksMetadataWithoutEmptySuggestions,
      platform.pinnedBlocks ?? [],
    );

    const popularBlocks = getPopularBlocks(
      blocksMetadataWithoutEmptySuggestions,
      platform.pinnedBlocks ?? [],
    );

    const flowControllerBlocks =
      blocksMetadataWithoutEmptySuggestions.filter(isFlowController);

    const utilityBlocks =
      blocksMetadataWithoutEmptySuggestions.filter(isUtilityBlock);

    const blockMetadataWithoutPopularOrPinnedBlocks =
      blocksMetadataWithoutEmptySuggestions.filter(
        (p) => !popularBlocks.includes(p) && !pinnedBlocks.includes(p),
      );

    const appBlocks =
      blockMetadataWithoutPopularOrPinnedBlocks.filter(isAppBlock);

    const utilitiesCategory = {
      title: t('Utility'),
      metadata: utilityBlocks,
    };
    const flowControllerCategory = {
      title: t('Flow Controller'),
      metadata: flowControllerBlocks,
    };
    const appsCategory = {
      title: t('Apps'),
      metadata: appBlocks,
    };
    const popularCategory = {
      title: t('Popular'),
      metadata: popularBlocks,
    };
    const allCategory = {
      title: t('All'),
      metadata: blocksMetadataWithoutEmptySuggestions,
    };

    switch (selectedTab) {
      case BlockSelectorTabType.EXPLORE:
        return {
          isLoading: false,
          data: getExploreTabContent(
            blocksMetadataWithoutEmptySuggestions,
            platform,
            props.type,
          ),
        };
      case BlockSelectorTabType.UTILITY:
        return {
          isLoading: false,
          data: [utilitiesCategory, flowControllerCategory],
        };
      case BlockSelectorTabType.AI_AND_AGENTS:
        return {
          isLoading: false,
          data: getAiAndAgentsBlocks(blocksMetadataWithoutEmptySuggestions),
        };
      case BlockSelectorTabType.APPROVALS:
        return {
          isLoading: false,
          data: [],
        };
      case BlockSelectorTabType.APPS: {
        const popularAppsCategory = {
          ...popularCategory,
          metadata: popularCategory.metadata.filter(isAppBlock),
        };
        const result = {
          isLoading: false,
          data: [popularAppsCategory, appsCategory],
        };
        if (pinnedBlocks.length > 0) {
          result.data.unshift({
            title: t('Highlights'),
            metadata: pinnedBlocks,
          });
        }
        return result;
      }

      case BlockSelectorTabType.NONE: {
        if (props.shouldCaptureEvent && props.searchQuery.length > 3) {
          capture({
            name: TelemetryEventName.BLOCK_SELECTOR_SEARCH,
            payload: {
              search: props.searchQuery,
              isTrigger: props.type === 'trigger',
              selectedActionOrTriggerName: null,
            },
          });
        }
        return {
          isLoading: false,
          data: allCategory.metadata.length > 0 ? [allCategory] : [],
        };
      }
    }
  },
  useBlockOptions: <
    T extends
      | PropertyType.DYNAMIC
      | PropertyType.DROPDOWN
      | PropertyType.MULTI_SELECT_DROPDOWN,
  >({
    onSuccess,
    onError,
    onMutate,
  }: {
    onSuccess: (data: ExecutePropsResult<T>) => void;
    onError: (error: Error) => void;
    onMutate: () => void;
  }) => {
    return useMutation<
      ExecutePropsResult<T>,
      Error,
      { request: BlockOptionRequest; propertyType: T }
    >({
      mutationFn: async ({ request, propertyType }) => {
        onMutate();
        return blocksApi.options(request, propertyType);
      },
      onSuccess,
      onError,
      retry: 1,
      retryDelay: 1000,
    });
  },
  useBlockVersions: (blockName: string) => {
    const { data: release } = flagsHooks.useFlag<string>(
      IbFlagId.CURRENT_VERSION,
    );
    const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);
    const query = useQuery({
      queryKey: ['pieces-registry', release, edition],
      queryFn: () => blocksApi.registry(release!, edition!),
      staleTime: Infinity,
      enabled: !!blockName && !!release && !!edition,
      select: (registry) =>
        registry
          .filter((entry) => entry.name === blockName)
          .map((entry) => ({ version: entry.version }))
          .sort((a, b) => semver.rcompare(a.version, b.version)),
    });
    return {
      blockVersions: query.data,
      isLoading: query.isLoading,
    };
  },
  useBlockForEmbeddingConnection: ({
    blockName,
    connectionExternalId,
  }: {
    blockName: string;
    connectionExternalId: string;
  }) => {
    return useQuery<BlockMetadataModel, Error>({
      queryKey: ['piece', blockName, connectionExternalId],
      queryFn: async () => {
        const appConnection = (
          await appConnectionsApi.list({
            blockName,
            limit: 1,
            projectId: authenticationSession.getProjectId()!,
          })
        ).data.find(
          (connection) => connection.externalId === connectionExternalId,
        );
        if (!appConnection) {
          return blocksApi.get({ name: blockName });
        }
        return blocksApi.get({
          name: appConnection.blockName,
          version: appConnection.blockVersion,
        });
      },
      staleTime: Infinity,
    });
  },
};

export const blocksMutations = {
  useInstallBlock: ({
    onSuccess,
    onError,
  }: {
    onSuccess: () => void;
    onError: (error: unknown) => void;
  }) => {
    return useMutation({
      mutationFn: (data: AddBlockRequestBody) => blocksApi.install(data),
      onSuccess,
      onError,
    });
  },
};

const filterOutBlocksWithNoSuggestions = (
  stepsMetadata: StepMetadataWithSuggestions[],
) => {
  return stepsMetadata.filter((metadata) => {
    const isActionWithSuggestions =
      metadata.type === FlowActionType.BLOCK &&
      metadata.suggestedActions &&
      metadata.suggestedActions.length > 0;

    const isTriggerWithSuggestions =
      metadata.type === FlowTriggerType.BLOCK &&
      metadata.suggestedTriggers &&
      metadata.suggestedTriggers.length > 0;

    const isNotBlockType =
      metadata.type !== FlowActionType.BLOCK &&
      metadata.type !== FlowTriggerType.BLOCK;
    return (
      isActionWithSuggestions || isTriggerWithSuggestions || isNotBlockType
    );
  });
};

const getExploreTabContent = (
  queryResult: StepMetadataWithSuggestions[],
  platform: PlatformWithoutSensitiveData,
  type: 'action' | 'trigger',
) => {
  const popularCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Popular'),
    metadata: [],
  };
  const pinnedBlocks = getPinnedBlocks(
    queryResult,
    platform.pinnedBlocks ?? [],
  );
  const popularBlocks = getPopularBlocks(
    queryResult,
    platform.pinnedBlocks ?? [],
  );

  if (popularBlocks.length > 0) {
    popularCategory.metadata = [...popularCategory.metadata, ...popularBlocks];
  }

  const hightlightedBlocksCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Featured'),
    metadata: [],
  };
  const highlightedBlocks = getHighlightedBlocks(queryResult, type);
  const codeBlock = queryResult.find(
    (block) => block.type === FlowActionType.CODE,
  );
  const branchBlock = queryResult.find(
    (block) => block.type === FlowActionType.ROUTER,
  );
  const loopBlock = queryResult.find(
    (block) => block.type === FlowActionType.LOOP_ON_ITEMS,
  );

  if (highlightedBlocks.length > 0) {
    hightlightedBlocksCategory.metadata.push(...highlightedBlocks);
  }

  if (branchBlock) {
    hightlightedBlocksCategory.metadata.splice(0, 0, branchBlock);
  }

  if (codeBlock) {
    hightlightedBlocksCategory.metadata.splice(3, 0, codeBlock);
  }
  if (loopBlock) {
    hightlightedBlocksCategory.metadata.splice(5, 0, loopBlock);
  }
  if (pinnedBlocks.length > 0) {
    hightlightedBlocksCategory.metadata = [
      ...pinnedBlocks,
      ...hightlightedBlocksCategory.metadata,
    ];
  }

  return [popularCategory, hightlightedBlocksCategory];
};
