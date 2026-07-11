import { OAuth2AuthorizationMethod, BlockAuth } from '@intelblocks/blocks-framework';

export const figmaAuth = BlockAuth.OAuth2({
  description: '',
  authUrl: 'https://www.figma.com/oauth',
  tokenUrl: 'https://api.figma.com/v1/oauth/token',
  required: true,
  scope: ['file_content:read', 'file_metadata:read', 'file_comments:read', 'file_comments:write'],
  authorizationMethod: OAuth2AuthorizationMethod.HEADER,
});
