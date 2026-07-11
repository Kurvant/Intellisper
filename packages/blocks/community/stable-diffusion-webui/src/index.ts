import {
  createBlock,
  BlockAuth,
  Property,
} from '@intelblocks/blocks-framework';
import { textToImage } from './lib/actions/text-to-image';
import { stableDiffusionAuth } from './lib/auth';

export type StableDiffusionAuthType = {
  baseUrl: string;
};

export const stableDiffusion = createBlock({
  displayName: 'Stable Dffusion web UI',
  description: 'A web interface for Stable Diffusion',
  auth: stableDiffusionAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/stable-diffusion-webui.png',
  authors: ['AdamSelene', 'abuaboud'],
  actions: [textToImage],
  triggers: [],
});
