import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { cancelAppointment } from './lib/actions/cancel-appointment';
import { fetchAvailability } from './lib/actions/fetch-availability';
import { rescheduleAppointment } from './lib/actions/reschedule-appointment';
import { bookAppointment } from './lib/actions/book-appointment';
import { getAppointmentDetails } from './lib/actions/get-appointment-details';
import { zohoBookingsAuth } from './lib/common';
import { BlockCategory } from '@intelblocks/shared';

export const zohoBookings = createBlock({
  displayName: 'Zoho Bookings',
  description:
    'Zoho Bookings is an appointment scheduling software for managing bookings, services, and customer appointments.',
  auth: zohoBookingsAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/zoho-bookings.png',
  authors: ['fortunamide', 'sanket-a11y'],
  actions: [
    bookAppointment,
    rescheduleAppointment,
    fetchAvailability,
    getAppointmentDetails,
    cancelAppointment,
  ],
  triggers: [],
});
