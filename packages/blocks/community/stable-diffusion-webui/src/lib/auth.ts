import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const stableDiffusionAuth = BlockAuth.CustomAuth({
  required: true,
  props: {
    baseUrl: Property.ShortText({
      displayName: 'Stable Diffusion web UI API base URL',
      required: true,
    }),
  },
});
