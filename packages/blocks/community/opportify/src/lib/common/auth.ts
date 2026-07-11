import { BlockAuth } from "@intelblocks/blocks-framework";

export const opportifyAuth = BlockAuth.SecretText({
    displayName:'API Key',
    required:true,
    description:`You can obtain your API key from [API Key List](https://app.opportify.ai/api-keys/list).`
})