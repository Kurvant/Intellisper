import { BlockAuth, Property } from "@intelblocks/blocks-framework";
import { makeRequest } from "./client";
import { HttpMethod } from "@intelblocks/blocks-common";

export const smooveAuth = BlockAuth.SecretText({
    displayName: 'smoove API Key',
    required: true,
    validate: async ({ auth }) => {
        if (auth) {
            try {
                await makeRequest(auth as string, HttpMethod.GET, '/Lists', {});
                return {
                    valid: true,
                }
            } catch (error) {
                return {
                    valid: false,
                    error: 'Invalid Api Key'
                }
            }

        }
        return {
            valid: false,
            error: 'Invalid Api Key'
        }

    },

})