import { createBlock } from '@intelblocks/blocks-framework';
import { humeAiAuth } from './lib/common/auth';
import { generateTextToSpeech } from './lib/actions/generate-text-to-speech';
import { generateSpeechFromFile } from './lib/actions/generate-speech-from-file';
import { createVoice } from './lib/actions/create-voice';
import { deleteVoice } from './lib/actions/delete-voice';
import { analyzeEmotionsFromUrl } from './lib/actions/analyze-emotions-from-url';
import { getEmotionResults } from './lib/actions/get-emotion-results';
import { newVoiceTrigger } from './lib/triggers/new-voice';
import { BlockCategory } from '@intelblocks/shared';

export const humeAi = createBlock({
  displayName: 'Hume AI',
  auth: humeAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/hume-ai.png',
  authors: ['onyedikachi-david'],
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  actions: [
    generateTextToSpeech,
    generateSpeechFromFile,
    createVoice,
    deleteVoice,
    analyzeEmotionsFromUrl,
    getEmotionResults,
  ],
  triggers: [newVoiceTrigger],
});
