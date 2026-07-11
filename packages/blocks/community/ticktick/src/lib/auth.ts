import { BlockAuth } from '@intelblocks/blocks-framework';

export const ticktickAuth = BlockAuth.OAuth2({
	authUrl: 'https://ticktick.com/oauth/authorize',
	tokenUrl: 'https://ticktick.com/oauth/token',
	required: true,
	scope: ['tasks:read', 'tasks:write'],
});
