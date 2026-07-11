import type { OutputSchema } from '@intelblocks/blocks-framework';
import { isNil } from '@intelblocks/shared';

import { blocksHooks } from './pieces-hooks';

function useBlockOutputSchema({
  blockName,
  blockVersion,
  stepName,
}: {
  blockName?: string;
  blockVersion?: string;
  stepName?: string;
}): OutputSchema | null {
  const { blockModel } = blocksHooks.useBlock({
    name: blockName ?? '',
    version: blockVersion,
    enabled: !isNil(blockName) && !isNil(stepName),
  });

  if (!blockModel || !stepName) return null;
  const fromTrigger = blockModel.triggers?.[stepName]?.outputSchema;
  if (fromTrigger) return fromTrigger;
  const fromAction = blockModel.actions?.[stepName]?.outputSchema;
  if (fromAction) return fromAction;
  return null;
}

export { useBlockOutputSchema };
