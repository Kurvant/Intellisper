import {
  ListOAuth2AppRequest,
  OAuthApp,
  UpsertOAuth2AppRequest,
  SeekPage,
} from '@intelblocks/shared';

import { api } from '@/lib/api';

export const oauthAppsApi = {
  listPlatformOAuth2Apps(request: ListOAuth2AppRequest) {
    return api.get<SeekPage<OAuthApp>>('/v1/oauth-apps', request);
  },
  delete(credentialId: string) {
    return api.delete<void>(`/v1/oauth-apps/${credentialId}`);
  },
  upsert(request: UpsertOAuth2AppRequest) {
    return api.post<OAuthApp>('/v1/oauth-apps', request);
  },
};
