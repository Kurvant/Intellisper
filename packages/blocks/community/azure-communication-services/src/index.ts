import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { sendEmail } from './lib/actions/send-email';
import { BlockCategory } from '@intelblocks/shared';

export const azureCommunicationServiceAuth = BlockAuth.SecretText({
  displayName: 'Connection string',
  required: true,
});

export const azureCommunicationServices = createBlock({
  displayName: 'Azure Communication Services',
  description: 'Communication services from Microsoft Azure',
  auth: azureCommunicationServiceAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl:
    'https://cdn.activepieces.com/pieces/azure-communication-services.png',
  categories: [BlockCategory.COMMUNICATION, BlockCategory.MARKETING],
  authors: ['matthieu-lombard'],
  actions: [sendEmail],
  triggers: [],
});
