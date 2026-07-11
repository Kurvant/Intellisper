import { BlockAuth } from "@intelblocks/blocks-framework";

export const formStackAuth = BlockAuth.OAuth2({
    description: 'Connect your Formstack account',
    authUrl: 'https://www.formstack.com/api/v2/oauth2/authorize',
    tokenUrl: 'https://www.formstack.com/api/v2/oauth2/token',
    required: true,
    scope: [],
});

