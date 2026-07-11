import { BlockAuth } from "@intelblocks/blocks-framework";

export const doctlyAuth = BlockAuth.SecretText({
    displayName:'API Key',
    required:true,
    description:`You can obtain API key from [API Settings](https://doctly.ai/keys).`
})