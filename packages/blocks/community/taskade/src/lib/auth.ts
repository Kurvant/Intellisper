import { BlockAuth } from '@intelblocks/blocks-framework';

export const taskadeAuth = BlockAuth.SecretText({
	displayName: 'Personal Token',
	required: true,
	description: `
	1. Navigate to https://taskade.com/settings/password and scroll down to Personal Access Tokens.
	2. Create your personal access token with any name.`,
});
