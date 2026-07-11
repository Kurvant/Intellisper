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
        // Predefined OAuth2 apps are the ones this platform registered itself.
        // This edition hosts no shared OAuth2 client on the operator's behalf, so
        // an app the platform has not configured has no predefined client and the
        // connection dialog asks for the user's own credentials instead.
        const apps =
          edition === IbEdition.COMMUNITY
            ? {
                data: [],
              }
            : await oauthAppsApi.listPlatformOAuth2Apps({
                limit: 1000000,
                cursor: undefined,
              });
        const appsMap: BlocksOAuth2AppsMap = {};

        apps.data.forEach((app) => {
          appsMap[app.blockName] = {
            platformOAuth2App: {
              oauth2Type: AppConnectionType.PLATFORM_OAUTH2,
              clientId: app.clientId,
            },
            cloudOAuth2App: null,
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
