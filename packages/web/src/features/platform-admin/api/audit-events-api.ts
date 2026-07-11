import {
  ApplicationEvent,
  ListAuditEventsRequest,
  SeekPage,
} from '@intelblocks/shared';

import { api } from '@/lib/api';

export const auditEventsApi = {
  list(request: ListAuditEventsRequest) {
    return api.get<SeekPage<ApplicationEvent>>('/v1/audit-events', request);
  },
};
