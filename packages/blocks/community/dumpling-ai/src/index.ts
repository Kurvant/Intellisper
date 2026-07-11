import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import {
	webSearch,
	searchNews,
	generateImage,
	scrapeWebsite,
	crawlWebsite,
	extractDocument,
} from './lib/actions';
import { BlockCategory } from '@intelblocks/shared';
import {
	AuthenticationType,
	createCustomApiCallAction,
	httpClient,
	HttpMethod,
} from '@intelblocks/blocks-common';
import { dumplingAuth } from './lib/auth';

export const dumplingAi = createBlock({
	displayName: 'Dumpling AI',
	description:'Transform unstructured website content into clean, AI-ready data',
	auth: dumplingAuth,
	minimumSupportedRelease: '0.36.1',
	logoUrl: 'https://cdn.activepieces.com/pieces/dumpling-ai.png',
	authors: ['neo773'],
	categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE, BlockCategory.PRODUCTIVITY],
	actions: [
		webSearch,
		searchNews,
		generateImage,
		scrapeWebsite,
		crawlWebsite,
		extractDocument,
		createCustomApiCallAction({
			baseUrl: () => 'https://app.dumplingai.com/api/v1',
			auth: dumplingAuth,
			authMapping: async (auth) => ({
				Authorization: `Bearer ${auth}`,
			}),
		}),
	],
	triggers: [],
});
