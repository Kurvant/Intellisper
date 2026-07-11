import { TriggerBase, TriggerStrategy } from '@intelblocks/blocks-framework';
import { TriggerTestStrategy } from '@intelblocks/shared';

import { blockSelectorUtils } from '@/features/pieces';

export type TestType =
  | 'mcp-tool'
  | 'chat-trigger'
  | 'simulation'
  | 'webhook'
  | 'polling';

export const triggerEventUtils = {
  getTestType: ({
    triggerName,
    blockName,
    trigger,
  }: {
    triggerName: string;
    blockName: string;
    trigger: TriggerBase;
  }): TestType => {
    if (blockSelectorUtils.isMcpToolTrigger(blockName, triggerName)) {
      return 'mcp-tool';
    }
    if (blockSelectorUtils.isChatTrigger(blockName, triggerName)) {
      return 'chat-trigger';
    }
    if (
      blockName === '@intelblocks/block-webhook' &&
      triggerName === 'catch_webhook'
    ) {
      return 'webhook';
    }

    if (
      trigger.type === TriggerStrategy.APP_WEBHOOK ||
      trigger.type === TriggerStrategy.WEBHOOK
    ) {
      switch (trigger.testStrategy) {
        case TriggerTestStrategy.TEST_FUNCTION:
          return 'polling';
        case TriggerTestStrategy.SIMULATION:
          return 'simulation';
      }
    }

    return 'polling';
  },
};
