import { BlockAuth } from "@intelblocks/blocks-framework";


const authdec = `
`

export const videoaskAuth = BlockAuth.OAuth2({
    description: authdec,
    authUrl: 'https://auth.videoask.com/authorize',
    tokenUrl: 'https://auth.videoask.com/oauth/token',
    required: true,
    scope: [],
})