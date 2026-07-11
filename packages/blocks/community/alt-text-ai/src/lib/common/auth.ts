import { BlockAuth } from "@intelblocks/blocks-framework";
import { httpClient, HttpMethod } from "@intelblocks/blocks-common";
import { BASE_URL } from "./constants";

export const altTextAiAuth = BlockAuth.SecretText({
    displayName: 'API Key',
    required: true,
    description: `You can obtain your API key from [Account Settings](https://alttext.ai/account/api_keys).`,
    validate: async ({ auth }) => {
        try {
            await httpClient.sendRequest({
                method: HttpMethod.GET,
                url: BASE_URL + '/account',
                headers: {
                    'X-API-Key': auth
                }
            })

            return {
                valid: true
            }

        } catch {
            return {
                valid: false,
                error: 'Invalid API Key'
            }
        }
    }
})