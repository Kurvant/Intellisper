import {
  AppConnectionValueForAuthProperty,
  BlockAuth,
} from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { baremetricsApiCall } from './client';
import { AppConnectionType } from '@intelblocks/shared';

const BAREMETRICS_SCOPES = [
  'read',
  'write',
] as const;

export const baremetricsAuth = [
  BlockAuth.OAuth2({
    description: 'Connect your Baremetrics account using OAuth2. Requires approval from Baremetrics support to get Client ID and Client Secret.',
    authUrl: 'https://app.baremetrics.com/oauth/authorize',
    tokenUrl: 'https://app.baremetrics.com/oauth/token',
    required: true,
    scope: [...BAREMETRICS_SCOPES],
    validate: async ({ auth }) => {
      try {
        await baremetricsApiCall({
          method: HttpMethod.GET,
          path: '/account',
          auth: {
            type: AppConnectionType.OAUTH2,
            access_token: auth.access_token,
          },
        });
        return { valid: true };
      } catch (e) {
        return {
          valid: false,
          error: (e as Error).message,
        };
      }
    },
  }),
  BlockAuth.SecretText({
    displayName: 'API Key',
    required: true,
    description: 'API key found in Baremetrics Settings area',
    validate: async ({ auth }) => {
      try {
        await baremetricsApiCall({
          method: HttpMethod.GET,
          path: '/account',
          auth: {
            type: AppConnectionType.SECRET_TEXT,
            secret_text: auth,
          },
        });
        return { valid: true };
      } catch (e) {
        return {
          valid: false,
          error: (e as Error).message,
        };
      }
    },
  }),
];

export type BaremetricsAuthValue = AppConnectionValueForAuthProperty<
  typeof baremetricsAuth
>;
