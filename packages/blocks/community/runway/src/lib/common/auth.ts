import { BlockAuth } from '@intelblocks/blocks-framework';

export const runwayAuth = BlockAuth.SecretText({
	displayName: 'API Key',
	description: 'Your Runway API key. Get it from your Runway account settings.',
	required: true,
});


