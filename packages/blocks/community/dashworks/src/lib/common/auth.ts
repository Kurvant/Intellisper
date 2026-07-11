import { BlockAuth } from "@intelblocks/blocks-framework";

export const dashworksAuth = BlockAuth.SecretText({
    displayName:'API Key',
    required:true,
    description:`You can obtain API key from [API Settings](https://web.dashworks.ai/admin/api-keys).`
})