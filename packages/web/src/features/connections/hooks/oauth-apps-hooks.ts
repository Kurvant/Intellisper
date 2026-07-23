import {
  UpsertOAuth2AppRequest,
  IbEdition,
  IbFlagId,
  AppConnectionType,
} from '@intelblocks/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { BlocksOAuth2AppsMap } from '@/features/connections/utils/oauth2-utils';
import { flagsHooks } from '@/hooks/flags-hooks';

import { oauthAppsApi } from '../api/oauth-apps';

export const oauthAppsMutations = {
  useDeleteOAuthApp: (refetch: () => void, setOpen: (open: boolean) => void) =>
    useMutation({
      mutationFn: async (credentialId: string) => {
        await oauthAppsApi.delete(credentialId);
        refetch();
      },
      onSuccess: () => {
        toast.success(t('OAuth2 Credentials Deleted'), {
          duration: 3000,
        });
        setOpen(false);
      },
    }),

  useUpsertOAuthApp: (
    refetch: () => void,
    setOpen: (open: boolean) => void,
    onConfigurationDone: () => void,
  ) =>
    useMutation({
      mutationFn: async (request: UpsertOAuth2AppRequest) => {
        await oauthAppsApi.upsert(request);
        refetch();
      },
      onSuccess: () => {
        toast.success(t('OAuth2 Credentials Updated'), {
          duration: 3000,
        });
        onConfigurationDone();
        setOpen(false);
      },
    }),
};

export const oauthAppsQueries = {
  useOAuthAppConfigured(blockId: string) {
    const query = useQuery({
      queryKey: ['oauth2-apps-configured'],
      queryFn: async () => {
        const response = await oauthAppsApi.listPlatformOAuth2Apps({
          limit: 1000000,
        });
        return response.data;
      },
      select: (data) => {
        return data.find((app) => app.blockName === blockId);
      },
      staleTime: Infinity,
    });
    return {
      refetch: query.refetch,
      oauth2App: query.data,
    };
  },
  useBlocksOAuth2AppsMap() {
    const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);

    return useQuery<BlocksOAuth2AppsMap, Error>({
      queryKey: ['oauth-apps'],
      queryFn: async () => {
        // Two independent sources of managed OAuth, merged into one map:
        //   - PLATFORM apps: client credentials an organisation registered itself (DB-backed).
        //   - CLOUD apps: providers the operator's broker manages (broker holds the secret).
        // A block in either list shows a one-click Connect instead of asking for the user's own
        // credentials. When both exist, the organisation's own platform app takes precedence over
        // the broker default (see getPredefinedOAuth2App). On COMMUNITY there is no platform
        // registry; the cloud list is still consulted because a self-hosted install may point at
        // a broker.
        const [platformApps, cloudApps] = await Promise.all([
          edition === IbEdition.COMMUNITY
            ? Promise.resolve({ data: [] })
            : oauthAppsApi.listPlatformOAuth2Apps({
                limit: 1000000,
                cursor: undefined,
              }),
          // Best-effort: the endpoint already degrades to an empty list if the broker is
          // unreachable, so a failure here should never block the dialog.
          oauthAppsApi
            .listCloudOAuth2Apps()
            .catch(() => ({ providers: [] as { blockName: string; clientId: string }[] })),
        ]);

        const appsMap: BlocksOAuth2AppsMap = {};

        platformApps.data.forEach((app) => {
          appsMap[app.blockName] = {
            platformOAuth2App: {
              oauth2Type: AppConnectionType.PLATFORM_OAUTH2,
              clientId: app.clientId,
            },
            cloudOAuth2App: null,
          };
        });

        cloudApps.providers.forEach((provider) => {
          const existing = appsMap[provider.blockName];
          appsMap[provider.blockName] = {
            platformOAuth2App: existing?.platformOAuth2App ?? null,
            cloudOAuth2App: {
              oauth2Type: AppConnectionType.CLOUD_OAUTH2,
              clientId: provider.clientId,
            },
          };
        });

        return appsMap;
      },
      staleTime: 0,
    });
  },
};

export type BlockToClientIdMap = {
  [
    blockName: `${string}-${
      | AppConnectionType.CLOUD_OAUTH2
      | AppConnectionType.PLATFORM_OAUTH2}`
  ]: {
    oauth2Type:
      | AppConnectionType.CLOUD_OAUTH2
      | AppConnectionType.PLATFORM_OAUTH2;
    clientId: string;
  };
};
