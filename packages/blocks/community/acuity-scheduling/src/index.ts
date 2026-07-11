import { OAuth2PropertyValue, BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import {
	addBlockedTimeAction,
	createAppointmentAction,
	createClientAction,
	findAppointmentAction,
	findClientAction,
	rescheduleAppointmentAction,
	updateClientAction,
} from './lib/actions';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { API_URL } from './lib/common';
import { appointmentCanceledTrigger, appointmentScheduledTrigger } from './lib/triggers';
import { acuitySchedulingAuth } from './lib/auth';

export const acuityScheduling = createBlock({
	displayName: 'Acuity Scheduling',
	logoUrl: 'https://cdn.activepieces.com/pieces/acuity-scheduling.png',
	auth: acuitySchedulingAuth,
	categories: [BlockCategory.PRODUCTIVITY, BlockCategory.SALES_AND_CRM],
	minimumSupportedRelease: '0.36.1',
	authors: ['onyedikachi-david', 'kishanprmr'],
	actions: [
		addBlockedTimeAction,
		createAppointmentAction,
		createClientAction,
		rescheduleAppointmentAction,
		updateClientAction,
		findAppointmentAction,
		findClientAction,
		createCustomApiCallAction({
			auth: acuitySchedulingAuth,
			baseUrl: () => API_URL,
			authMapping: async (auth) => {
				return {
					Authorization: `Bearer ${auth.access_token}`,
				};
			},
		}),
	],
	triggers: [appointmentCanceledTrigger, appointmentScheduledTrigger],
});
