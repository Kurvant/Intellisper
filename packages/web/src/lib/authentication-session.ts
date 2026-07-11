import {
  AuthenticationResponse,
  isNil,
  Principal,
  PrincipalType,
} from '@intelblocks/shared';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';

import { authenticationApi } from '@/api/authentication-api';
import { queryClient } from '@/app/query-client';

import { IbStorage } from './ib-browser-storage';
const tokenKey = 'token';
const projectIdKey = 'projectId';
export const authenticationSession = {
  setProjectId(projectId: string) {
    IbStorage.getInstance().setItem(projectIdKey, projectId);
  },
  saveResponse(response: AuthenticationResponse, isEmbedding: boolean) {
    if (isEmbedding) {
      IbStorage.setInstanceToSessionStorage();
    }
    IbStorage.getInstance().setItem(tokenKey, response.token);
    if (!isNil(response.projectId)) {
      IbStorage.getInstance().setItem(projectIdKey, response.projectId);
    }
    queryClient.invalidateQueries({ queryKey: ['flags'] });
    window.dispatchEvent(new Event('storage'));
  },
  isJwtExpired(token: string): boolean {
    if (!token) {
      return true;
    }
    try {
      const decoded = jwtDecode(token);
      if (decoded && decoded.exp && dayjs().isAfter(dayjs.unix(decoded.exp))) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  },
  getToken(): string | null {
    return IbStorage.getInstance().getItem(tokenKey) ?? null;
  },

  getProjectId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const projectId = IbStorage.getInstance().getItem(projectIdKey);
    if (!isNil(projectId)) {
      return projectId;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('projectId' in decodedJwt && typeof decodedJwt.projectId === 'string') {
      return decodedJwt.projectId;
    }
    return null;
  },
  getCurrentUserId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    return decodedJwt.id;
  },
  appendProjectRoutePrefix(path: string): string {
    const projectId = this.getProjectId();

    if (isNil(projectId)) {
      return path;
    }
    return `/projects/${projectId}${path.startsWith('/') ? path : `/${path}`}`;
  },
  getPlatformId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('platform' in decodedJwt && decodedJwt.platform) {
      return decodedJwt.platform.id;
    }
    return null;
  },
  isOnboarding(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    const decodedJwt = jwtDecode<{ type: string }>(token);
    return decodedJwt.type === PrincipalType.ONBOARDING;
  },
  async switchToPlatform(platformId: string) {
    if (authenticationSession.getPlatformId() === platformId) {
      return;
    }
    const result = await authenticationApi.switchPlatform({
      platformId,
    });
    IbStorage.getInstance().setItem(tokenKey, result.token);
    if (!isNil(result.projectId)) {
      IbStorage.getInstance().setItem(projectIdKey, result.projectId);
    }
    window.location.href = '/';
  },
  switchToProject(projectId: string) {
    if (authenticationSession.getProjectId() === projectId) {
      return;
    }
    IbStorage.getInstance().setItem(projectIdKey, projectId);
    window.dispatchEvent(new Event('storage'));
  },
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    return !this.isJwtExpired(token);
  },
  clearSession() {
    IbStorage.getInstance().removeItem(projectIdKey);
    IbStorage.getInstance().removeItem(tokenKey);
  },
  logOut() {
    this.clearSession();
    window.location.href = '/sign-in';
  },
};

function getDecodedJwt(token: string): Principal {
  return jwtDecode<Principal>(token);
}
