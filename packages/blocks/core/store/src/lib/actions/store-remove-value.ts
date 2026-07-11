import {
  ActionContext,
  createAction,
  BlockAuthProperty,
  Property,
  ShortTextProperty,
  StaticDropdownProperty,
} from '@intelblocks/blocks-framework';
import { common, getScopeAndKey, BlockStoreScope } from './common';
import { z } from 'zod';
import { propsValidation } from '@intelblocks/blocks-common';

async function executeStorageRemoveValue(context: ActionContext<BlockAuthProperty | undefined, {
  key: ShortTextProperty<true>;
  store_scope: StaticDropdownProperty<BlockStoreScope, true>;
}>, isTestMode = false) {
  await propsValidation.validateZod(context.propsValue, {
    key: z.string().max(128),
  });

  const { key, scope } = getScopeAndKey({
    runId: context.run.id,
    key: context.propsValue['key'],
    scope: context.propsValue.store_scope,
    isTestMode,
  });
  await context.store.delete(key, scope);
  return {
    success: true,
  };
}

export const storageRemoveValue = createAction({
  audience: 'human',
  name: 'remove_value',
  displayName: 'Remove',
  description: 'Remove a value from storage',
  errorHandlingOptions: {
    continueOnFailure: {
      hide: true,
    },
    retryOnFailure: {
      hide: true,
    },
  },
  props: {
    key: Property.ShortText({
      displayName: 'Key',
      required: true,
    }),
    store_scope: common.store_scope,
  },
  async run(context) {
    return await executeStorageRemoveValue(context, false);
  },
  async test(context) {
    return await executeStorageRemoveValue(context, true);
  },
});
