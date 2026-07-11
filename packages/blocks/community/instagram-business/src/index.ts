import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { uploadPhoto } from './lib/actions/upload-photo';
import { uploadReel } from './lib/actions/upload-reel';
import { instagramCommon } from './lib/common';

export const instagramBusiness = createBlock({
  displayName: 'Instagram for Business',
  description: 'Grow your business on Instagram',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/instagram.png',
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  auth: instagramCommon.authentication,
  actions: [uploadPhoto, uploadReel],
  triggers: [],
});
