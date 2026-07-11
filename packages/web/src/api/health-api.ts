import { GetSystemHealthChecksResponse } from '@intelblocks/shared';

import { api } from '@/lib/api';

export const healthApi = {
  getSystemHealthChecks(): Promise<GetSystemHealthChecksResponse> {
    return api.get<GetSystemHealthChecksResponse>('/v1/health/system');
  },
};
