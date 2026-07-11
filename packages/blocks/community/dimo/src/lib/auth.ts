import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const dimoAuth = BlockAuth.CustomAuth({
	description: `You can obtain following credentials by creating Developer License at [Developer Console](https://console.dimo.org/).`,
	required: true,
	props: {
		clientId: Property.ShortText({
			displayName: 'Client ID',
			required: true,
		}),
		redirectUri: Property.ShortText({
			displayName: 'Redirect URI',
			required: true,
		}),
		apiKey: Property.ShortText({
			displayName: 'API Key',
			required: true,
		}),
	},
});
