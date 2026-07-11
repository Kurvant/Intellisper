import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { findUserByCustomFieldAction } from './lib/actions/find-user-by-custom-field';
import { createSubscriberAction } from './lib/actions/create-subscriber';
import { sendContentToUserAction } from './lib/actions/send-content-to-user';
import { setCustomFieldAction } from './lib/actions/set-custom-fields';
import { removeTagFromUserAction } from './lib/actions/remove-tag-from-user';
import { addTagToUserAction } from './lib/actions/add-tag-to-user';
import { findUserByNameAction } from './lib/actions/find-user-by-name';
import { BlockCategory } from '@intelblocks/shared';
import { AuthenticationType, httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { BASE_URL } from './lib/common/props';
import { manychatAuth } from './lib/auth';

export const manychat = createBlock({
	displayName: 'Manychat',
	description: 'Automations for Instagram, WhatsApp, TikTok, and Messenger marketing.',
	categories: [BlockCategory.MARKETING],
	auth: manychatAuth,
	minimumSupportedRelease: '0.36.1',
	logoUrl: 'https://cdn.activepieces.com/pieces/manychat.png',
	authors: ['neo773', 'kishanprmr'],
	actions: [
		addTagToUserAction,
		createSubscriberAction,
		findUserByCustomFieldAction,
		findUserByNameAction,
		removeTagFromUserAction,
		sendContentToUserAction,
		setCustomFieldAction,
	],
	triggers: [],
});
