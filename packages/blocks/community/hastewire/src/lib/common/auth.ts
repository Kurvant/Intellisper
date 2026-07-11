import { BlockAuth } from "@intelblocks/blocks-framework";

export const hastewireAuth = BlockAuth.SecretText({
    displayName:'API Key',
    required:true,
    description:`You can obtain API key from [Settings](https://hastewire.com/humanizer/account/api-keys).`
})