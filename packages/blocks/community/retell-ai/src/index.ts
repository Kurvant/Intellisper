
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from "@intelblocks/blocks-framework";
import { retellAiAuth } from './lib/common/auth';
import { makePhoneCall } from './lib/actions/make-phone-call';
import { createPhoneNumber } from './lib/actions/create-phone-number';
import { getCall } from './lib/actions/get-call';
import { getPhoneNumber } from './lib/actions/get-phone-number';
import { getVoice } from './lib/actions/get-voice';
import { getAgent } from './lib/actions/get-agent';
import { newCallTrigger } from './lib/triggers/new-call';
import { BlockCategory } from '@intelblocks/shared';

export const retellAi = createBlock({
  displayName: "Retell AI",
  auth: retellAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/retell-ai.png",
  authors: ['aryel780'],
  categories:[BlockCategory.BUSINESS_INTELLIGENCE,BlockCategory.PRODUCTIVITY,BlockCategory.COMMUNICATION],
  actions: [
    makePhoneCall, 
    createPhoneNumber, 
    getCall, 
    getPhoneNumber, 
    getVoice, 
    getAgent,
    createCustomApiCallAction({
      auth: retellAiAuth,
      baseUrl: () => 'https://api.retellai.com',
      authMapping: async (auth) => {
        const { apiKey } = auth.props;
        return {
          Authorization: `Bearer ${apiKey}`,
        };
      },
    }),
  ],
  triggers: [newCallTrigger],
});
