import { BlockAuth } from '@intelblocks/blocks-framework';

export const asanaAuth = BlockAuth.OAuth2({
  description: '',
  authUrl: 'https://app.asana.com/-/oauth_authorize',
  tokenUrl: 'https://app.asana.com/-/oauth_token',
  required: true,
  scope: ['default'],
});
