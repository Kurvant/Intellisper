import {
  AgentBlockProps,
  AgentProviderModel,
  AIProviderName,
  isNil,
  BlockAction,
  BlockActionSettings,
} from '@intelblocks/shared';
import { useFormContext } from 'react-hook-form';

import { AgentTools } from '@/app/builder/step-settings/agent-settings/agent-tools';
import { FormField } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { AIModelSelector, AgentStructuredOutput } from '@/features/agents';

import {
  selectGenericFormComponentForProperty,
  SelectGenericFormComponentForPropertyParams,
} from '../../piece-properties/properties-utils';
import { useStepSettingsContext } from '../step-settings-context';

type AgentSettingsProps = {
  step: BlockAction;
  flowId: string;
  readonly: boolean;
};

export const AgentSettings = (props: AgentSettingsProps) => {
  const { blockModel, updateFormSchema, updatePropertySettingsSchema } =
    useStepSettingsContext();
  const form = useFormContext();

  if (isNil(blockModel)) {
    return (
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
    );
  }

  const actionName = (props.step.settings as BlockActionSettings)
    .actionName as string;
  const selectedAction = blockModel.actions[actionName];
  const properties = (({ auth: _auth, ...rest }) => rest)(selectedAction.props);

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 w-full">
        {Object.keys(properties).map((propertyName) => {
          return (
            <FormField
              key={propertyName}
              name={`settings.input.${propertyName}`}
              control={form.control}
              render={({ field }) =>
                selectAgentFormComponentForProperty({
                  field,
                  allowDynamicValues: false,
                  dynamicInputModeToggled: false,
                  markdownVariables: {},
                  propertyName: propertyName,
                  inputName: `settings.input.${propertyName}`,
                  property: properties[propertyName],
                  useMentionTextInput: true,
                  disabled: props.readonly,
                  form: form,
                  dynamicPropsInfo: {
                    blockName: props.step.settings.blockName,
                    blockVersion: props.step.settings.blockVersion,
                    actionOrTriggerName: actionName,
                    placedInside: 'stepSettings',
                    updateFormSchema,
                    updatePropertySettingsSchema,
                  },
                  propertySettings: null,
                })
              }
            />
          );
        })}
      </div>
    </div>
  );
};

type selectFormComponentForPropertyParams =
  SelectGenericFormComponentForPropertyParams;
const selectAgentFormComponentForProperty = (
  params: selectFormComponentForPropertyParams,
) => {
  const { propertyName, disabled, field } = params;

  switch (propertyName) {
    case AgentBlockProps.AGENT_TOOLS: {
      const providerModel = params.form?.watch?.(
        'settings.input.aiProviderModel',
      ) as AgentProviderModel | undefined;
      return (
        <AgentTools
          disabled={disabled}
          toolsField={field}
          selectedProvider={
            providerModel?.provider as AIProviderName | undefined
          }
        />
      );
    }
    case AgentBlockProps.STRUCTURED_OUTPUT: {
      return (
        <AgentStructuredOutput
          disabled={disabled}
          structuredOutputField={field}
        />
      );
    }
    case AgentBlockProps.AI_PROVIDER_MODEL: {
      const provider = (field.value as AgentProviderModel).provider;
      const model = (field.value as AgentProviderModel).model;
      return (
        <AIModelSelector
          defaultModel={model}
          defaultProvider={provider}
          onChange={field.onChange}
          disabled={disabled}
        />
      );
    }
    default: {
      return selectGenericFormComponentForProperty({
        ...params,
        enableMarkdownForInputWithMention:
          propertyName === AgentBlockProps.PROMPT,
      });
    }
  }
};
