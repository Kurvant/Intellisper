import { HttpMethod } from '@intelblocks/blocks-common';
import { BlockAuth } from '@intelblocks/blocks-framework';
import { skyvernApiCall } from './client';

export const skyvernAuth = BlockAuth.SecretText({
	displayName: 'API Key',
	description: `You can obtain your API key by navigating to [Settings](https://app.skyvern.com/settings).`,
	required: true,
	validate: async ({ auth }) => {
		try {
			await skyvernApiCall({
				apiKey: auth as string,
				method: HttpMethod.GET,
				resourceUri: '/workflows',
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
