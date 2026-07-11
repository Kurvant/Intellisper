import { BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { wedofCommon } from './common/wedof';

export const wedofAuth = BlockAuth.SecretText({
    displayName: 'Clé API',
    required: true,
    description: 'Veuillez saisir votre clé API fournie par wedof',
    validate: async ({auth}) => {
        try {
            await httpClient.sendRequest({
                method: HttpMethod.GET,
                url: wedofCommon.baseUrl + '/users/me',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': auth,
                },
            });
            return {valid: true};
        } catch (error) {
            return {
                valid: false,
                error: 'Clé Api invalide',
            };
        }
    },
});
