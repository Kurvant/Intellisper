import { BlockMetadataModel } from '@intelblocks/blocks-framework';
import { isNil } from '@intelblocks/shared';

import { StepPropertySnapshot } from './explanation-prompt';

type BuildStepPropertiesSnapshotParams = {
  blockModel: BlockMetadataModel | undefined;
  stepKind: 'action' | 'trigger';
  stepName: string | undefined;
  input: Record<string, unknown> | undefined;
};

const MAX_PROPERTIES = 25;

const toSnapshot = ({
  blockModel,
  stepKind,
  stepName,
  input,
}: BuildStepPropertiesSnapshotParams): StepPropertySnapshot[] => {
  if (isNil(blockModel) || isNil(stepName)) {
    return [];
  }
  const stepDefinition =
    stepKind === 'trigger'
      ? blockModel.triggers?.[stepName]
      : blockModel.actions?.[stepName];
  if (isNil(stepDefinition) || isNil(stepDefinition.props)) {
    return [];
  }
  const properties = Object.entries(stepDefinition.props).slice(
    0,
    MAX_PROPERTIES,
  );
  return properties.map(([name, prop]) => {
    const currentValue = input?.[name];
    return {
      name,
      displayName: prop.displayName,
      description: prop.description,
      type: prop.type,
      required: prop.required,
      defaultValue: prop.defaultValue,
      currentValue,
    };
  });
};

const findStepDescription = ({
  blockModel,
  stepKind,
  stepName,
}: {
  blockModel: BlockMetadataModel | undefined;
  stepKind: 'action' | 'trigger';
  stepName: string | undefined;
}): string | undefined => {
  if (isNil(blockModel) || isNil(stepName)) {
    return undefined;
  }
  const definition =
    stepKind === 'trigger'
      ? blockModel.triggers?.[stepName]
      : blockModel.actions?.[stepName];
  return definition?.description;
};

const findBlockAuthType = (
  blockModel: BlockMetadataModel | undefined,
): string | undefined => {
  if (isNil(blockModel) || isNil(blockModel.auth)) {
    return undefined;
  }
  const auth = Array.isArray(blockModel.auth)
    ? blockModel.auth[0]
    : blockModel.auth;
  return auth?.type;
};

export const stepPropertiesSnapshotUtils = {
  build: toSnapshot,
  findDescription: findStepDescription,
  findAuthType: findBlockAuthType,
};
