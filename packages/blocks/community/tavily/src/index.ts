import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { searchAction } from './lib/actions/search';
import { extractAction } from './lib/actions/extract';
import { tavilyAuth } from './lib/auth';

export const tavily = createBlock({
	displayName: 'Tavily',
	description: 'Search engine tailored for AI agents.',
	minimumSupportedRelease: '0.30.0',
	logoUrl: 'https://cdn.activepieces.com/pieces/tavily.jpg',
	categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
	authors: ['OsamaHaikal'],
	auth: tavilyAuth,
	actions: [searchAction, extractAction,
		createCustomApiCallAction({
			baseUrl: () => 'https://api.tavily.com',
			auth: tavilyAuth,
			authMapping: async (auth) => ({ Authorization: `Bearer ${auth.secret_text}` }),
		})
	],
	triggers: [],
});
