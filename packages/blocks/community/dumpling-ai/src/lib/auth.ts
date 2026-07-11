import { BlockAuth } from '@intelblocks/blocks-framework';
import { AuthenticationType, httpClient, HttpMethod } from '@intelblocks/blocks-common';

export const dumplingAuth = BlockAuth.SecretText({
	displayName: 'API Key',
	required: true,
	description: `
  You can obtain API key from [API Section](https://app.dumplingai.com/api-keys).`,
	validate: async ({ auth }) => {
		try {
			await httpClient.sendRequest({
				url: 'https://app.dumplingai.com/api/v1/search',
				method: HttpMethod.POST,
				authentication: {
					type: AuthenticationType.BEARER_TOKEN,
					token: auth,
				},
				body: {
					query: 'Activepieces',
				},
			});

			return {
				valid: true,
			};
		} catch (e) {
			return { valid: false, error: 'Invalid API Key.' };
		}
	},
});
