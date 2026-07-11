import { BlockAuth } from '@intelblocks/blocks-framework';

export const weekdoneAuth = BlockAuth.OAuth2({
  description: 'Weekdone OAuth2 Authentication',
  authUrl: 'https://weekdone.com/oauth_authorize',
  tokenUrl: 'https://weekdone.com/oauth_token',
  required: true,
  scope: [],
});
