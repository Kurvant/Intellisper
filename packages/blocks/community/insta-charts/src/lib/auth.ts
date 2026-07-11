import { BlockAuth } from '@intelblocks/blocks-framework';

export const instaChartsAuth = BlockAuth.OAuth2({
  description: 'InstaCharts OAuth2 Authentication',
  authUrl: 'https://api.instacharts.io/v1/oauth/authorize',
  tokenUrl: 'https://api.instacharts.io/v1/oauth/token',
  required: true,
  scope: ['read', 'write'],
});
