import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { sendNotification } from './lib/actions/send-notification';

export const pushoverAuth = BlockAuth.CustomAuth({
  description: `
    To obtain the api token:

    1. Log in to Pushover.
    2. Click on your Application or on Create an Application/API Token
    3. Copy the API Token/Key.

    To obtain the user key:
    1. Log in to Pushover
    2. Copy your Your User Key

    Note if you want to send the message to your group, you should specify a group key instead of the user key
    `,
  props: {
    api_token: BlockAuth.SecretText({
      displayName: 'Api Token',
      description: 'Pushover Api Token',
      required: true,
    }),
    user_key: BlockAuth.SecretText({
      displayName: 'User Key',
      description: 'Pushover User Key',
      required: true,
    }),
  },
  required: true,
});

export const pushover = createBlock({
  displayName: 'Pushover',
  description: 'Simple push notification service',

  logoUrl: 'https://cdn.activepieces.com/pieces/pushover.png',
  categories: [BlockCategory.COMMUNICATION],
  minimumSupportedRelease: '0.30.0',
  authors: ["MyWay","Vitalini","kishanprmr","khaledmashaly","abuaboud"],
  auth: pushoverAuth,
  actions: [sendNotification],
  triggers: [],
});
