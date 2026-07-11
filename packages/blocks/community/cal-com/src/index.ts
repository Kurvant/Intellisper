import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { triggers } from './lib/triggers';

export const calcomAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key provided by cal.com',
  required: true,
});

export const calcom = createBlock({
  displayName: 'Cal.com',
  description: 'Open-source alternative to Calendly',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/cal.com.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ["kishanprmr","AbdulTheActivePiecer","khaledmashaly","abuaboud"],
  auth: calcomAuth,
  actions: [],
  triggers,
});
