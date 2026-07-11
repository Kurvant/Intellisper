import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import {
  HttpMethod,
  createCustomApiCallAction,
  httpClient,
} from '@intelblocks/blocks-common';
import { BASE_URL } from './lib/common/constants';
import { uploadDocumentAction } from './lib/actions/upload-document';
import { createPresentationAction } from './lib/actions/create-presentation';
import { editPresentationAction } from './lib/actions/edit-presentation';
import { getTaskStatusAction } from './lib/actions/get-task-status';
import { newPresentationTrigger } from './lib/triggers/new-presentation';
import { BlockCategory } from '@intelblocks/shared';
import { slidespeakAuth } from './lib/auth';

export const slidespeak = createBlock({
  displayName: 'SlideSpeak',
  auth: slidespeakAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/slidespeak.png',
  authors: ['rimjhimyadav'],
  categories:[BlockCategory.CONTENT_AND_FILES,BlockCategory.PRODUCTIVITY],
  actions: [
    createPresentationAction,
    editPresentationAction,
    getTaskStatusAction,
    uploadDocumentAction,
    createCustomApiCallAction({
      auth:slidespeakAuth,
      baseUrl:()=>BASE_URL,
      authMapping:async (auth)=>{
         return{
           'X-API-key':auth.secret_text,
        }
      }
    })
  ],
  triggers: [newPresentationTrigger],
});
