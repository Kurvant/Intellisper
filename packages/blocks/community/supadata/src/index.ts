import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { getTranscriptAction } from './lib/actions/get-transcript';
import { BlockCategory } from '@intelblocks/shared';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { supadataConfig } from './lib/config';

const markdownDescription = `
To obtain your free Supadata API Key, sign up at [Supadata](https://supadata.ai) and then copy the key available in the [dashboard](https://dash.supadata.ai).
`;

export const supadataAuth = BlockAuth.SecretText({
  description: markdownDescription,
  displayName: 'API Key',
  required: true,
  validate: async (auth) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${supadataConfig.baseUrl}/health`,
        headers: {
          [supadataConfig.accessTokenHeaderKey]: auth.auth,
        },
      });
      return {
        valid: true,
      };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API Key.',
      };
    }
  },
});

export const supadata = createBlock({
  displayName: 'Supadata',
  auth: supadataAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/supadata.svg',
  authors: ['rafalzawadzki'],
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE, BlockCategory.DEVELOPER_TOOLS, BlockCategory.CONTENT_AND_FILES],
  description: 'YouTube Transcripts',
  actions: [getTranscriptAction],
  triggers: [],
}); 