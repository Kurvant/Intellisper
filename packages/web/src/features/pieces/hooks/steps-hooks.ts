import {
  FlowAction,
  FlowActionType,
  FlowTriggerType,
  LocalesEnum,
  SuggestionType,
  FlowTrigger,
  isNil,
} from '@intelblocks/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { authenticationSession } from '@/lib/authentication-session';

import { blocksApi } from '../api/pieces-api';
import {
  StepMetadataWithActionOrTriggerOrAgentDisplayName,
  StepMetadataWithSuggestions,
} from '../types';
import {
  CORE_ACTIONS_METADATA,
  CORE_STEP_METADATA,
  stepUtils,
} from '../utils/step-utils';

export const stepsHooks = {
  useStepMetadata: ({ step }: UseStepMetadata) => {
    const { i18n } = useTranslation();
    const query = useQuery<
      StepMetadataWithActionOrTriggerOrAgentDisplayName,
      Error
    >({
      queryKey: getQueryKeyForStepMetadata(step, i18n.language as LocalesEnum),
      queryFn: () => stepUtils.getMetadata(step!, i18n.language as LocalesEnum),
      enabled: !isNil(step),
    });
    return {
      stepMetadata: query.data,
      isLoading: query.isLoading,
    };
  },
  useStepsMetadata: (props: (FlowAction | FlowTrigger)[]) => {
    const { i18n } = useTranslation();
    return useQueries({
      queries: props.map((step) => {
        return {
          queryKey: getQueryKeyForStepMetadata(
            step,
            i18n.language as LocalesEnum,
          ),
          queryFn: () =>
            stepUtils.getMetadata(step, i18n.language as LocalesEnum),
          staleTime: Infinity,
        };
      }),
    });
  },
  useAllStepsMetadata: ({ searchQuery, type, enabled }: UseMetadataProps) => {
    const { i18n } = useTranslation();
    const query = useQuery<StepMetadataWithSuggestions[], Error>({
      queryKey: ['pieces-metadata', searchQuery, type],
      queryFn: async () => {
        const blocks = await blocksApi.list({
          projectId: authenticationSession.getProjectId()!,
          searchQuery,
          suggestionType:
            type === 'action' ? SuggestionType.ACTION : SuggestionType.TRIGGER,
          locale: i18n.language as LocalesEnum,
        });

        const filteredBlocksBySuggestionType = blocks.filter(
          (block) =>
            (type === 'action' && block.actions > 0) ||
            (type === 'trigger' && block.triggers > 0),
        );

        const blocksMetadata = filteredBlocksBySuggestionType.map((block) => {
          const metadata = stepUtils.mapBlockToMetadata({
            block,
            type,
          });
          return {
            ...metadata,
            suggestedActions: block.suggestedActions,
            suggestedTriggers: block.suggestedTriggers,
          };
        });

        switch (type) {
          case 'action': {
            const filteredCoreActions = CORE_ACTIONS_METADATA.filter((step) =>
              passSearch(searchQuery, step),
            );
            return [...filteredCoreActions, ...blocksMetadata];
          }
          case 'trigger':
            return [...blocksMetadata];
        }
      },
      enabled,
      staleTime: searchQuery ? 0 : Infinity,
    });
    return {
      refetch: query.refetch,
      metadata: query.data,
      isLoading: query.isLoading,
    };
  },
};
function passSearch(
  searchQuery: string | undefined,
  data: (typeof CORE_STEP_METADATA)[keyof typeof CORE_STEP_METADATA],
) {
  if (!searchQuery) {
    return true;
  }
  return JSON.stringify({ data })
    .toLowerCase()
    .includes(searchQuery?.toLowerCase());
}

type UseStepMetadata = {
  step: FlowAction | FlowTrigger | undefined;
};

type UseMetadataProps = {
  searchQuery: string;
  enabled?: boolean;
  type: 'action' | 'trigger';
};

const getQueryKeyForStepMetadata = (
  step: FlowAction | FlowTrigger | undefined,
  locale: LocalesEnum,
): (string | undefined)[] => {
  if (isNil(step)) {
    return ['step-metadata-disabled', locale];
  }
  const isBlockStep =
    step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK;
  const blockName = isBlockStep ? step.settings.blockName : undefined;
  const blockVersion = isBlockStep ? step.settings.blockVersion : undefined;
  const customLogoUrl =
    'customLogoUrl' in step && typeof step.customLogoUrl === 'string'
      ? step.customLogoUrl
      : undefined;
  const actionName =
    step.type === FlowActionType.BLOCK ? step.settings.actionName : undefined;
  const triggerName =
    step.type === FlowTriggerType.BLOCK ? step.settings.triggerName : undefined;
  return [
    actionName,
    triggerName,
    blockName,
    blockVersion,
    customLogoUrl,
    locale,
    step.type,
  ];
};
