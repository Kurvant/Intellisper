import { BlockAuth } from '@intelblocks/blocks-framework';

export const acuitySchedulingAuth = BlockAuth.OAuth2({
	required: true,
	authUrl: 'https://acuityscheduling.com/oauth2/authorize',
	tokenUrl: 'https://acuityscheduling.com/oauth2/token',
	scope: ['api-v1'],
});
