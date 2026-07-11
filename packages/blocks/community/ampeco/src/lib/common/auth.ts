import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const ampecoAuth = BlockAuth.CustomAuth({
    description: 'Ampeco Platform',
    required: true,
    props: {
        baseApiUrl: Property.ShortText({
            displayName: 'Base URL',
            required: true,
        }),
        token: BlockAuth.SecretText({
            displayName: 'API Token',
            required: true,
            description:`Navigate to the API Access Tokens menu within your account.Click the Create API Access Token button to initiate the token creation process.`
        }),
    },
});