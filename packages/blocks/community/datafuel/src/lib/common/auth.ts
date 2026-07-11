import { BlockAuth } from '@intelblocks/blocks-framework';

export const dataFuelAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: `You can obtain API key from [Settings](https://app.datafuel.dev/account/api_key).`,
  required: true,
});
