import { BlockAuth } from "@intelblocks/blocks-framework";
import { makeRequest } from "./client";
import { HttpMethod } from "@intelblocks/blocks-common";

export const BumpupsAuth = BlockAuth.SecretText({
    displayName: 'Bumpups API Key',
    description: `**Enter your Bumpups API Key.**
---
### How to obtain your API key
1. Sign up or log in at [bumpups.com](https://bumpups.com).
2. Go to **Settings** → **API**.
3. Enable API access and generate a key.
4. Copy and paste it here.
`,
    required: true,
    
});
