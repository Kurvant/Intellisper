import { BlockAuth } from '@intelblocks/blocks-framework';

export interface BirdAuthValue {
  apiKey: string;
  workspaceId: string;
  channelId: string;
}

export const birdAuth = BlockAuth.CustomAuth({
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API Key',
      description: 'Bird API Access Key from Settings > Security > Access Keys',
      required: true,
    }),
    workspaceId: BlockAuth.SecretText({
      displayName: 'Workspace ID',
      description: 'Bird Workspace ID found in your workspace URL',
      required: true,
    }),
    channelId: BlockAuth.SecretText({
      displayName: 'Channel ID',
      description: 'Your SMS channel ID from Bird dashboard',
      required: true,
    }),
  },
  required: true,
}); 