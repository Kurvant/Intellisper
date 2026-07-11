import { BlockAuth } from '@intelblocks/blocks-framework';

export const hootsuiteAuth = BlockAuth.OAuth2({
  description:
    'Connect your Hootsuite account. Create an OAuth2 app and get your client credentials at https://developer.hootsuite.com.',
  required: true,
  authUrl: 'https://platform.hootsuite.com/oauth2/auth',
  tokenUrl: 'https://platform.hootsuite.com/oauth2/token',
  scope: ['offline', 'post'],
});
