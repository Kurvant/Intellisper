import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { everhourApiCall } from './common/client';

export const everhourAuth = BlockAuth.SecretText({
    displayName: 'API Key',
    description: `You can find your API key by going to **Settings -> API** in Everhour.`,
    required: true,
    validate: async ({ auth }) => {
        try {
            await everhourApiCall({
                apiKey: auth,
                method: HttpMethod.GET,
                resourceUri: '/users/me',
            });
            return { valid: true };
        } catch {
            return {
                valid: false,
                error: 'Invalid API Key.',
            };
        }
    },
});