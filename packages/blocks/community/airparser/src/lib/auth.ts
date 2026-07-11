import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { airparserApiCall } from './common';

export const airparserAuth = BlockAuth.SecretText({
	displayName: 'API Key',
	required: true,
	description: 'You can find your API key in the Airparser dashboard under Account Settings.',
	validate: async ({ auth }) => {
		try {
			await airparserApiCall({
				apiKey: auth as string,
				method: HttpMethod.GET,
				resourceUri: '/inboxes',
			});

			return {
				valid: true,
			};
		} catch {
			return {
				valid: false,
				error: 'Invalid API key.',
			};
		}
	},
});
