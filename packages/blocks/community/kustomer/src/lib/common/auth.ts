import { BlockAuth } from '@intelblocks/blocks-framework';
import { tryCatch } from '@intelblocks/shared';
import { kustomerClient } from './client';

export const kustomerAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description: `Authenticate using a Kustomer API token.

Paste a private Kustomer API token with access to customers, conversations, and KObjects.`,
  required: true,
  validate: async ({ auth }) => {
    const apiKey = auth as string;

    if (!apiKey) {
      return {
        valid: false,
        error: 'Invalid API token.',
      };
    }

    const { error } = await tryCatch(() =>
      kustomerClient.validateAuth({
        apiKey,
      })
    );

    if (error) {
      return {
        valid: false,
        error: 'Invalid API token or missing Kustomer permissions.',
      };
    }

    return {
      valid: true,
    };
  },
});
