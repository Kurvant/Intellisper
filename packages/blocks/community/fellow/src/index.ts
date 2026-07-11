import { createBlock } from '@intelblocks/blocks-framework';
import { fellowAuth, getBaseUrl } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { getNoteAction } from './lib/actions/get-note';
import { newRecordingTrigger } from './lib/triggers/new-recording';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const fellow = createBlock({
  displayName: 'Fellow.ai',
  description: 'AI Meeting Assistant and Notetaker',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE, BlockCategory.PRODUCTIVITY],
  auth: fellowAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/fellow.png',
  authors: ['kishanprmr'],
  actions: [getNoteAction,
    createCustomApiCallAction({
      auth: fellowAuth,
      baseUrl: (auth) => {
        return getBaseUrl(auth?.props.subdomain ?? '')
      },
      authMapping: async (auth) => {
        return {
          'X-API-KEY': `${auth.props.apiKey}`
        }
      }
    })],
  triggers: [newRecordingTrigger],
});
