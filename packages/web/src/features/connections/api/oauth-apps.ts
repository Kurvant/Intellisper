import {
  ListOAuth2AppRequest,
  OAuthApp,
  UpsertOAuth2AppRequest,
  SeekPage,
} from '@intelblocks/shared';

import { api } from '@/lib/api';

export type CloudOAuthProvider = {
  blockName: string;
  clientId: string;
};

export const oauthAppsApi = {
  listPlatformOAuth2Apps(request: ListOAuth2AppRequest) {
    return api.get<SeekPage<OAuthApp>>('/v1/oauth-apps', request);
  },
  // The broker-managed providers (blockName + public clientId, never a secret). Blocks in this
  // list use a one-click Connect (CLOUD_OAUTH2) instead of asking for the user's own credentials.
  listCloudOAuth2Apps() {
    return api.get<{ providers: CloudOAuthProvider[] }>('/v1/oauth-apps/cloud');
  },
  delete(credentialId: string) {
    return api.delete<void>(`/v1/oauth-apps/${credentialId}`);
  },
  upsert(request: UpsertOAuth2AppRequest) {
    return api.post<OAuthApp>('/v1/oauth-apps', request);
  },
};
