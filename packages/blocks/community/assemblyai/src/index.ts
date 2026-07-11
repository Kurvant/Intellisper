import { createBlock } from '@intelblocks/blocks-framework';
import * as actions from './lib/actions';
import { assemblyaiAuth } from './lib/auth';
import { BlockCategory } from '@intelblocks/shared';

export const assemblyai = createBlock({
  displayName: 'AssemblyAI',
  auth: assemblyaiAuth,
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  description:
    "Transcribe and extract data from audio using AssemblyAI's Speech AI.",
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/assemblyai.png',
  authors: ['AssemblyAI'],
  actions: [
    actions.uploadFile,
    actions.transcribe,
    actions.getTranscript,
    actions.getSentences,
    actions.getParagraphs,
    actions.getSubtitles,
    actions.getRedactedAudio,
    actions.wordSearch,
    actions.listTranscripts,
    actions.deleteTranscript,
    actions.lemurTask,
    actions.getLemurResponse,
    actions.purgeLemurRequestData,
    actions.customApiCall,
  ],
  triggers: [],
});
