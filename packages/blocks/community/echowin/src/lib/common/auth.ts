import { BlockAuth } from '@intelblocks/blocks-framework';

export const echowinAuth = BlockAuth.SecretText({
  displayName: 'Echowin API Key',
  description: 'API Key for Echowin. Get it from [Echowin Settings](https://echo.win/portal/settings/integrations)',
  required: true,
});
