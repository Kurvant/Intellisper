import { BlockAuth } from '@intelblocks/blocks-framework';
import { makeRequest } from './client';
import { HttpMethod } from '@intelblocks/blocks-common';
import { AppConnectionType } from '@intelblocks/shared';

export const pdfmonkeyAuth = BlockAuth.SecretText({
	displayName: 'API Key',
	description: `You can obtain your API key by navigating to [Account Settings](https://dashboard.pdfmonkey.io/account).`,
	required: true,
	validate: async ({ auth }) => {
		try {
			await makeRequest({
				type: AppConnectionType.SECRET_TEXT,
				secret_text: auth,
			}, HttpMethod.GET, '/documents', {});
			return {
				valid: true,
			};
		} catch {
			return {
				valid: false,
				error: 'Invalid API Key.',
			};
		}
	},
});
