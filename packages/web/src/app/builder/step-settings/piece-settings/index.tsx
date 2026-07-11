import {
  IbFlagId,
  isNil,
  BlockAction,
  BlockActionSettings,
  BlockTrigger,
  BlockTriggerSettings,
} from '@intelblocks/shared';
import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { flagsHooks } from '@/hooks/flags-hooks';

import { GenericPropertiesForm } from '../../piece-properties/generic-properties-form';
import { useStepSettingsContext } from '../step-settings-context';

import { ConnectionSelect } from './connection-select';

type BlockSettingsProps = {
  step: BlockAction | BlockTrigger;
  flowId: string;
  readonly: boolean;
};

const removeAuthFromProps = (
  props: Record<string, any>,
): Record<string, any> => {
  const { auth: _, ...rest } = props;
  return rest;
};

const BlockSettings = React.memo((props: BlockSettingsProps) => {
  const {
    blockModel,
    selectedStep,
    updateFormSchema,
    updatePropertySettingsSchema,
  } = useStepSettingsContext();

  const actionName = (props.step.settings as BlockActionSettings).actionName;
  const selectedAction = actionName
    ? blockModel?.actions[actionName]
    : undefined;
  const triggerName = (props.step.settings as BlockTriggerSettings).triggerName;
  const selectedTrigger = triggerName
    ? blockModel?.triggers[triggerName]
    : undefined;

  const actionPropsWithoutAuth = removeAuthFromProps(
    selectedAction?.props ?? {},
  );
  const triggerPropsWithoutAuth = removeAuthFromProps(
    selectedTrigger?.props ?? {},
  );

  const { data: webhookPrefixUrl } = flagsHooks.useFlag<string>(
    IbFlagId.WEBHOOK_URL_PREFIX,
  );

  const { data: pausedFlowTimeoutDays } = flagsHooks.useFlag<number>(
    IbFlagId.PAUSED_FLOW_TIMEOUT_DAYS,
  );

  const { data: webhookTimeoutSeconds } = flagsHooks.useFlag<number>(
    IbFlagId.WEBHOOK_TIMEOUT_SECONDS,
  );

  const { data: frontendUrl } = flagsHooks.useFlag<string>(IbFlagId.PUBLIC_URL);
  const markdownVariables = {
    webhookUrl: `${webhookPrefixUrl}/${props.flowId}`,
    formUrl: `${frontendUrl}forms/${props.flowId}`,
    chatUrl: `${frontendUrl}chats/${props.flowId}`,
    pausedFlowTimeoutDays: pausedFlowTimeoutDays?.toString() ?? '',
    webhookTimeoutSeconds: webhookTimeoutSeconds?.toString() ?? '',
  };

  const showAuthForAction =
    !isNil(selectedAction) && (selectedAction.requireAuth ?? true);
  const showAuthForTrigger =
    !isNil(selectedTrigger) && (selectedTrigger.requireAuth ?? true);
  return (
    <div className="flex flex-col gap-4 w-full">
      {!blockModel && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="space-y-2" key={index}>
              <div className="flex justify-between items-center">
                <Skeleton className="w-40 h-4" />
                <Skeleton className="size-8" />
              </div>
              <Skeleton className="w-full h-12" />
            </div>
          ))}
        </div>
      )}

      {blockModel && (
        <>
          {blockModel.auth && (showAuthForAction || showAuthForTrigger) && (
            <ConnectionSelect
              isTrigger={!isNil(selectedTrigger)}
              block={blockModel}
              disabled={props.readonly}
            ></ConnectionSelect>
          )}
          {selectedAction && (
            <GenericPropertiesForm
              key={selectedAction.name}
              prefixValue={'settings.input'}
              props={actionPropsWithoutAuth}
              propertySettings={selectedStep.settings.propertySettings}
              disabled={props.readonly}
              useMentionTextInput={true}
              markdownVariables={markdownVariables}
              dynamicPropsInfo={{
                blockName: blockModel.name,
                blockVersion: blockModel.version,
                actionOrTriggerName: selectedAction.name,
                placedInside: 'stepSettings',
                updateFormSchema,
                updatePropertySettingsSchema,
              }}
            ></GenericPropertiesForm>
          )}
          {selectedTrigger && (
            <GenericPropertiesForm
              dynamicPropsInfo={{
                blockName: blockModel.name,
                blockVersion: blockModel.version,
                actionOrTriggerName: selectedTrigger.name,
                placedInside: 'stepSettings',
                updateFormSchema,
                updatePropertySettingsSchema,
              }}
              key={selectedTrigger.name}
              prefixValue={'settings.input'}
              props={triggerPropsWithoutAuth}
              useMentionTextInput={true}
              propertySettings={selectedStep.settings.propertySettings}
              disabled={props.readonly}
              markdownVariables={markdownVariables}
            ></GenericPropertiesForm>
          )}
        </>
      )}
    </div>
  );
});

BlockSettings.displayName = 'BlockSettings';
export { BlockSettings };
