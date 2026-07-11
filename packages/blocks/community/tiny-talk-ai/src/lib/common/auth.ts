import { BlockAuth } from "@intelblocks/blocks-framework";

export const tinyTalkAiAuth = BlockAuth.SecretText({
    displayName:'API Key',
    required:true,
    description:`You can obtain API key from [Dashboard Settings](https://dashboard.tinytalk.ai/).`
})