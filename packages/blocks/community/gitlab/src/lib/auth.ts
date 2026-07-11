import { BlockAuth } from '@intelblocks/blocks-framework';

export const gitlabAuth = BlockAuth.OAuth2({
  required: true,
  authUrl: 'https://gitlab.com/oauth/authorize',
  tokenUrl: 'https://gitlab.com/oauth/token',
  scope: ['api', 'read_user'],
});
