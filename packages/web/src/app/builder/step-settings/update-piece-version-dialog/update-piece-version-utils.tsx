import { OAuth2Props, BlockPropertyMap } from '@intelblocks/blocks-framework';
import {
  FlowActionType,
  FlowOperationRequest,
  FlowOperationType,
  FlowTriggerType,
  isNil,
  BlockAction,
  BlockTrigger,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { AlertTriangle, ArrowUp, Info } from 'lucide-react';
import semver from 'semver';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formUtils, blockSelectorUtils, blocksApi } from '@/features/pieces';

function getVersionChangeType({
  currentVersion,
  selectedVersion,
}: {
  currentVersion: string;
  selectedVersion: string;
}): VersionChangeType {
  if (currentVersion === selectedVersion)
    return VersionChangeType.PATCH_UPGRADE;

  const current = semver.parse(currentVersion);
  const selected = semver.parse(selectedVersion);
  if (!current || !selected) return VersionChangeType.MINOR_OR_MAJOR;

  if (current.major !== selected.major || current.minor !== selected.minor) {
    return VersionChangeType.MINOR_OR_MAJOR;
  }
  if (semver.lt(selectedVersion, currentVersion)) {
    return VersionChangeType.PATCH_DOWNGRADE;
  }
  return VersionChangeType.PATCH_UPGRADE;
}

function getLatestMinorOrMajorUpgrade({
  currentVersion,
  versions,
}: {
  currentVersion: string;
  versions: { version: string }[];
}): string | undefined {
  const latest = versions[0]?.version;
  if (!latest) return undefined;
  const changeType = getVersionChangeType({
    currentVersion,
    selectedVersion: latest,
  });
  if (
    changeType === VersionChangeType.MINOR_OR_MAJOR &&
    semver.gt(latest, currentVersion)
  ) {
    return latest;
  }
  return undefined;
}

function getInputAfterVersionChange({
  versionChangeType,
  props,
  currentInput,
}: {
  versionChangeType: VersionChangeType;
  props: BlockPropertyMap | OAuth2Props;
  currentInput: Record<string, unknown>;
}): Record<string, unknown> {
  if (versionChangeType === VersionChangeType.MINOR_OR_MAJOR) {
    return formUtils.getDefaultValueForProperties({
      props: { ...props },
      existingInput: {},
    });
  }
  if (versionChangeType === VersionChangeType.PATCH_DOWNGRADE) {
    return formUtils.getDefaultValueForProperties({
      props: { ...props },
      existingInput: currentInput,
    });
  }
  return currentInput;
}

function getLatestVersion({
  currentVersion,
  versions,
}: {
  currentVersion: string;
  versions: { version: string }[];
}): string | undefined {
  const latest = versions[0]?.version;
  if (!latest || !semver.gt(latest, currentVersion)) return undefined;
  return latest;
}

export function LatestVersionAvailableAlert({
  isLatestMinorOrMajor,
}: LatestVersionAvailableAlertProps) {
  return (
    <Alert variant={isLatestMinorOrMajor ? 'warning' : 'default'}>
      {isLatestMinorOrMajor ? (
        <AlertTriangle className="size-4" />
      ) : (
        <ArrowUp className="size-4" />
      )}
      <AlertTitle>
        {isLatestMinorOrMajor
          ? t('Significant update available')
          : t('Newer version available')}
      </AlertTitle>
      <AlertDescription>
        {isLatestMinorOrMajor
          ? t('MajorUpgradeNote')
          : t(
              'Settings will carry over. Retest the step as the output may have changed.',
            )}
      </AlertDescription>
    </Alert>
  );
}

export function MinorOrMajorSelectionAlert() {
  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertDescription>{t('MajorUpgradeNote')}</AlertDescription>
    </Alert>
  );
}

export function PatchUpgradeInfoAlert() {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertDescription>
        {t('Settings will carry over. Retest as the output may have changed.')}
      </AlertDescription>
    </Alert>
  );
}

export function PatchDowngradeInfoAlert() {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertDescription>
        {t(
          "You're switching to an older patch. Your settings will be kept where possible.",
        )}
      </AlertDescription>
    </Alert>
  );
}

async function applyBlockVersionChange({
  step,
  targetVersion,
  currentVersion,
  applyOperation,
}: {
  step: BlockAction | BlockTrigger;
  targetVersion: string;
  currentVersion: string;
  applyOperation: (operation: FlowOperationRequest) => void;
}) {
  const blockName = step.settings.blockName;
  const actionOrTriggerName =
    step.type === FlowTriggerType.BLOCK
      ? step.settings.triggerName ?? ''
      : step.settings.actionName ?? '';

  const block = await blocksApi.get({
    name: blockName,
    version: targetVersion,
  });
  const changeType = getVersionChangeType({
    currentVersion,
    selectedVersion: targetVersion,
  });

  const actionOrTriggerDef =
    step.type === FlowTriggerType.BLOCK
      ? block.triggers[actionOrTriggerName]
      : block.actions[actionOrTriggerName];

  if (isNil(actionOrTriggerDef)) {
    throw new Error(
      t(
        'The selected version does not include the current action or trigger. Please choose a different version.',
      ),
    );
  }

  const input = getInputAfterVersionChange({
    versionChangeType: changeType,
    props: actionOrTriggerDef.props,
    currentInput: step.settings.input,
  });

  const valid = blockSelectorUtils.isBlockStepInputValid({
    props: actionOrTriggerDef.props,
    auth: block.auth,
    input,
    requireAuth: actionOrTriggerDef.requireAuth,
  });

  if (step.type === FlowTriggerType.BLOCK) {
    applyOperation({
      type: FlowOperationType.UPDATE_TRIGGER,
      request: {
        ...step,
        type: FlowTriggerType.BLOCK,
        valid,
        settings: {
          ...step.settings,
          blockVersion: targetVersion,
          input,
        },
      },
    });
  } else {
    applyOperation({
      type: FlowOperationType.UPDATE_ACTION,
      request: {
        ...step,
        type: FlowActionType.BLOCK,
        valid,
        settings: {
          ...step.settings,
          blockVersion: targetVersion,
          input,
        },
      },
    });
  }

  if (changeType === VersionChangeType.MINOR_OR_MAJOR) {
    applyOperation({
      type: FlowOperationType.UPDATE_SAMPLE_DATA_INFO,
      request: {
        stepName: step.name,
        sampleDataSettings: undefined,
      },
    });
  }
}

export const changeVersionUtils = {
  getVersionChangeType,
  getInputAfterVersionChange,
  getLatestMinorOrMajorUpgrade,
  getLatestVersion,
  applyBlockVersionChange,
};

export enum VersionChangeType {
  MINOR_OR_MAJOR = 'MINOR_OR_MAJOR',
  PATCH_DOWNGRADE = 'PATCH_DOWNGRADE',
  PATCH_UPGRADE = 'PATCH_UPGRADE',
}

type LatestVersionAvailableAlertProps = {
  isLatestMinorOrMajor: boolean;
};
