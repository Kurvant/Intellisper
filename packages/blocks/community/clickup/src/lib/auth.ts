import { BlockAuth } from '@intelblocks/blocks-framework';

export const clickupAuth = BlockAuth.OAuth2({
  description: '',
  authUrl: 'https://app.clickup.com/api',
  tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
  required: true,
  scope: [],
});
