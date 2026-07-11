import { BlockAuth } from '@intelblocks/blocks-framework';

export const raindropAuth = BlockAuth.OAuth2({
  required: true,
  authUrl: 'https://raindrop.io/oauth/authorize',
  tokenUrl: 'https://raindrop.io/oauth/access_token',
  scope: [],
  extra: {},
});
