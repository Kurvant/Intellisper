import { BlockAuth } from "@intelblocks/blocks-framework";
import { httpClient, HttpMethod } from "@intelblocks/blocks-common";

export const qwilrAuth = BlockAuth.SecretText({
    displayName: 'API Key',
    required: true,
    description: `
    1. Go to your Qwilr account settings.
    2. Navigate to API Settings.
    3. Copy your access token.`,
})
