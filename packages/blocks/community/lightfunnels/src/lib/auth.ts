import { BlockAuth } from '@intelblocks/blocks-framework';
import { OAuth2GrantType } from '@intelblocks/shared';

export const lightfunnelsAuth = BlockAuth.OAuth2({
  grantType: OAuth2GrantType.AUTHORIZATION_CODE,
  authUrl: 'https://app.lightfunnels.com/admin/oauth',
  tokenUrl: 'https://services.lightfunnels.com/oauth/access',
  required: true,
  scope: ['products,orders,customers,funnels'],
});
