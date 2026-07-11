import { createBlock } from '@intelblocks/blocks-framework';
import { doctlyAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { convertPdfToTextAction } from './lib/actions/convert-pdf-to-text';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BASE_URL } from './lib/common/constants';

export const doctly = createBlock({
	displayName: 'Doctly AI',
	auth: doctlyAuth,
	minimumSupportedRelease: '0.36.1',
	logoUrl: 'https://cdn.activepieces.com/pieces/doctly.png',
	categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
	authors: ['kishanprmr'],
	actions: [
		convertPdfToTextAction,
		createCustomApiCallAction({
			auth: doctlyAuth,
			baseUrl: () => BASE_URL,
			authMapping: async (auth) => {
				return {
					Authorization: `Bearer ${auth.secret_text}`,
				};
			},
		}),
	],
	triggers: [],
});
