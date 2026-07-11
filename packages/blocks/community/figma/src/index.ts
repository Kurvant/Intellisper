import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  OAuth2PropertyValue,
  BlockAuth,
  createBlock,
} from '@intelblocks/blocks-framework';
import { getCommentsAction } from './lib/actions/get-comments-action';
import { getFileAction } from './lib/actions/get-file-action';
import { postCommentAction } from './lib/actions/post-comment-action';
import { newCommentTrigger } from './lib/trigger/new-comment';
import { figmaAuth } from './lib/auth';

export const figma = createBlock({
  displayName: 'Figma',
  description: 'Collaborative interface design tool',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/figma.png',
  categories: [],
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: figmaAuth,
  actions: [
    getFileAction,
    getCommentsAction,
    postCommentAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.figma.com',
      auth: figmaAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}`,
      }),
    }),
  ],
  triggers: [newCommentTrigger],
});
