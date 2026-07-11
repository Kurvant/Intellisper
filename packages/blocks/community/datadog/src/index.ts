import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  constructDatadogBaseHeaders,
  constructDatadogBaseUrl,
} from './lib/common/helpers';
import { sendMultipleLogs } from './lib/actions/send-multiple-logs';
import { sendOneLog } from './lib/actions/send-one-log';
import { BlockCategory } from '@intelblocks/shared';
import { datadogAuth } from './lib/common/auth';

export const datadog = createBlock({
  displayName: 'Datadog',
  description: 'Cloud monitoring and analytics platform',
  auth: datadogAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/datadog.png',
  categories: [BlockCategory.DEVELOPER_TOOLS],
  authors: ['chaimaa-kadaoui'],
  actions: [
    sendMultipleLogs,
    sendOneLog,
    createCustomApiCallAction({
      baseUrl: (auth) => (auth ? constructDatadogBaseUrl(auth) : ''),
      auth: datadogAuth,
      authMapping: async (auth) => constructDatadogBaseHeaders(auth),
      authLocation: 'headers',
      props: {
        url: {
          description: `You can either use the full URL or the relative path to the base URL
i.e https://api.datadoghq.com/api/v2/resource or /resource.
When using the relative path, the default subdomain is "api" and the default version is "v2".`,
        },
      },
    }),
  ],
  triggers: [],
});
