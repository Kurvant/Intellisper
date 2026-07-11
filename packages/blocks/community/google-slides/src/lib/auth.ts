import { BlockAuth } from '@intelblocks/blocks-framework';

export const googleSlidesAuth = BlockAuth.OAuth2({
  description: '',

  authUrl: 'https://accounts.google.com/o/oauth2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  required: true,
  scope: [
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});
