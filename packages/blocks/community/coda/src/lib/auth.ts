import { BlockAuth } from '@intelblocks/blocks-framework';

export const codaAuth = BlockAuth.SecretText({
	displayName: 'Coda API Key',
	description: `Create an API key in the [Coda Account dashboard](https://coda.io/account).`,
	required: true,
});
