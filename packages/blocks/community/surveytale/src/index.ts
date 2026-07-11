import { createCustomApiCallAction } from '@intelblocks/blocks-common'
import { createBlock } from '@intelblocks/blocks-framework'
import { BlockCategory } from '@intelblocks/shared'
import { triggers } from './lib/triggers'
import { SURVEYTALE_BASE_URL, surveyTaleAuth } from './lib/auth'

export const surveytale = createBlock({
    displayName: 'SurveyTale',
    description: 'Experience management platform for surveys and feedback',
    auth: surveyTaleAuth,
    minimumSupportedRelease: '0.30.0',
    logoUrl: 'https://cdn.activepieces.com/pieces/surveytale.png',
    categories: [BlockCategory.BUSINESS_INTELLIGENCE,BlockCategory.FORMS_AND_SURVEYS],
    authors: ['nag381'],
    actions: [
        createCustomApiCallAction({
            auth: surveyTaleAuth,
            authMapping: async (auth) => {
                return {
                    'x-api-key': auth.secret_text as string,
                }
            },
            baseUrl: () => `${SURVEYTALE_BASE_URL}/api/v1`,
        }),
    ],
    triggers,
})
