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

async function executeStoragePut(context: ActionContext<BlockAuthProperty | undefined, {
  key: ShortTextProperty<true>;
  value: ShortTextProperty<true>;
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
  return await context.store.put(
    key,
    context.propsValue['value'],
   scope
  );
}

export const storagePutAction = createAction({
  audience: 'human',
  name: 'put',
  displayName: 'Put',
  description: 'Put a value in storage',
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
    value: Property.ShortText({
      displayName: 'Value',
      required: true,
    }),
    store_scope: common.store_scope,
  },
  async run(context) {
    return await executeStoragePut(context, false);
  },
  async test(context) {
    return await executeStoragePut(context, true);
  },
});
