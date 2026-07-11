import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { getTranscriptAction } from './lib/actions/get-transcript';
import { BlockCategory } from '@intelblocks/shared';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { gistlyConfig } from './lib/config';

const markdownDescription = `
To obtain your free Gistly API Key, sign up at [Gistly](https://gist.ly/youtube-transcript-api) and then copy the key available in the [dashboard](https://api-portal.gist.ly/).
`;

export const gistlyAuth = BlockAuth.SecretText({
  description: markdownDescription,
  displayName: 'API Key',
  required: true,
  validate: async (auth) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${gistlyConfig.baseUrl}/health`,
        headers: {
          [gistlyConfig.accessTokenHeaderKey]: auth.auth,
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

export const gistly = createBlock({
  displayName: 'Gistly',
  auth: gistlyAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/gistly.svg',
  authors: ['rafalzawadzki'],
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE, BlockCategory.DEVELOPER_TOOLS, BlockCategory.CONTENT_AND_FILES],
  description: 'YouTube Transcripts',
  actions: [getTranscriptAction],
  triggers: [],
}); 