import { BlockAuth } from '@intelblocks/blocks-framework';

export const claudeAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `Follow these instructions to get your Claude API Key:

1. Visit the following website: https://console.anthropic.com/settings/keys.
2. Once on the website, locate and click on the option to obtain your Claude API Key.
`,
});
