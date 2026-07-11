import { BlockAuth } from '@intelblocks/blocks-framework';

export const weekdoneAuth = BlockAuth.OAuth2({
  required: true,
  authUrl: 'https://weekdone.com/oauth_authorize',
  tokenUrl: 'https://weekdone.com/oauth_token',
  scope: [],
});
