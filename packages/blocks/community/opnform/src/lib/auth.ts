import { BlockAuth, Property } from '@intelblocks/blocks-framework';
import { opnformCommon } from './common';
import { AppConnectionType } from '@intelblocks/shared';

export const opnformAuth = BlockAuth.CustomAuth({
    description:
        'Please use your Opnform API Key. [Click here for create API Key](https://opnform.com/home?user-settings=access-tokens)',
    required: true,
    props: {
        baseApiUrl: Property.ShortText({
            displayName: `Base URL`,
            description: `Default value is 'https://api.opnform.com'.`,
            required: false,
        }),
        apiKey: BlockAuth.SecretText({
            displayName: 'API Key',
            required: true,
        }),
    },
    validate: async ({ auth }): Promise<{ valid: true } | { valid: false; error: string }> => {
        try {
            const isValid = await opnformCommon.validateAuth({
                props: auth,
                type: AppConnectionType.CUSTOM_AUTH,
            });
            if (isValid) {
                return { valid: true };
            }
            return { valid: false, error: 'Invalid API Key' };
        } catch (e) {
            return { valid: false, error: 'Invalid API Key' };
        }
    },
});
