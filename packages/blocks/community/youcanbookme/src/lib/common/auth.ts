import { BlockAuth } from '@intelblocks/blocks-framework';

export const youcanbookmeAuth = BlockAuth.SecretText({
  displayName: 'YouCanBookMe API Key',
  description: `
 Go to [app.youcanbookme.com](https://app.youcanbook.me/#/account/security/)
`,
  required: true,
});
