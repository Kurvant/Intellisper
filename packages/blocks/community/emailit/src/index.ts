import { createBlock } from '@intelblocks/blocks-framework'
import { sendEmailAction } from './lib/actions/send-email'
import { BlockCategory } from '@intelblocks/shared'
import { createCustomApiCallAction } from '@intelblocks/blocks-common'
import { emailitAuth } from './lib/auth'

export const emailit = createBlock({
    displayName: 'Emailit',
    description: 'Send transactional emails with Emailit',
    logoUrl: 'https://cdn.activepieces.com/pieces/emailit.svg',
    categories: [BlockCategory.COMMUNICATION, BlockCategory.PRODUCTIVITY],
    authors: ['dennisklappe', 'onyedikachi-david'],
    auth: emailitAuth,
    actions: [
        sendEmailAction,
        createCustomApiCallAction({
            baseUrl: () => 'https://api.emailit.com/v2',
            auth: emailitAuth,
            authMapping: async (auth) => ({
                Authorization: `Bearer ${auth.secret_text}`,
            }),
        }),
    ],
    triggers: [],
})
