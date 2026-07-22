import {
  AdminMemoryOverviewResponse,
  AgentMemoryScope,
  AgentOversightResponse,
  AgentRunStatus,
  ListAdminMemoryResponse,
  ListAgentRunsResponse,
  ListMemoryFactsResponse,
  MemoryFactKind,
  MemorySettingsResponse,
  MemoryVisibility,
} from '@intelblocks/shared';

import { api } from '@/lib/api';

type UsageResponse = {
  period: string;
  metrics: { metric: string; used: number; cap: number }[];
};

export const browserAgentApi = {
  listRuns(params: {
    projectId: string;
    status?: AgentRunStatus;
    page?: number;
    limit?: number;
  }) {
    return api.get<ListAgentRunsResponse>('/v1/browser-agent/runs', params);
  },
  usage(projectId: string) {
    return api.get<UsageResponse>('/v1/browser-agent/usage', { projectId });
  },
  oversight(params: { projectId: string; days?: number }) {
    return api.get<AgentOversightResponse>(
      '/v1/browser-agent/admin/oversight',
      params,
    );
  },
};

/**
 * Memory API — one client for BOTH products:
 *  - Intellisper Agent  → scope USER     (personal memory)
 *  - Intellisper Studio → scope PLATFORM (org memory) / FLOW (a single flow's memory)
 *
 * Every route is plan-gated server-side (memory is a paid capability) and answers 402 when the plan
 * does not include it. The `scope` never widens what the caller may see: a USER-scoped read is
 * always the caller's own memory, resolved from the principal — never from anything sent here.
 */
export const memoryApi = {
  list(params: {
    projectId: string;
    scope?: AgentMemoryScope;
    flowId?: string;
    search?: string;
    kind?: MemoryFactKind;
    page?: number;
    limit?: number;
  }) {
    return api.get<ListMemoryFactsResponse>('/v1/memory/facts', params);
  },
  create(body: {
    projectId: string;
    content: string;
    kind?: MemoryFactKind;
    scope?: AgentMemoryScope;
    flowId?: string;
  }) {
    return api.post<{ saved: boolean; refused?: boolean; id?: string }>(
      '/v1/memory/facts',
      body,
    );
  },
  update(
    id: string,
    body: { projectId: string; content?: string; kind?: MemoryFactKind },
  ) {
    return api.patch<{ ok: boolean; refused?: boolean }>(
      `/v1/memory/facts/${id}`,
      body,
    );
  },
  /**
   * The per-fact sharing veto. SHARED only makes a fact *eligible* for admin visibility — the
   * platform unlock and the owner's opt-in must also hold. PRIVATE is absolute.
   */
  setVisibility(
    id: string,
    body: { projectId: string; visibility: MemoryVisibility },
  ) {
    return api.post<{ ok: boolean }>(`/v1/memory/facts/${id}/visibility`, body);
  },
  remove(id: string, params: { projectId: string }) {
    return api.delete<{ ok: boolean }>(`/v1/memory/facts/${id}`, params);
  },
  bulkDelete(body: {
    projectId: string;
    scope?: AgentMemoryScope;
    flowId?: string;
  }) {
    return api.post<{ deleted: number }>('/v1/memory/facts/bulk-delete', body);
  },
  export(params: {
    projectId: string;
    scope?: AgentMemoryScope;
    flowId?: string;
  }) {
    return api.get<{ facts: Record<string, unknown>[] }>(
      '/v1/memory/facts/export',
      params,
    );
  },
  settings(projectId: string) {
    return api.get<MemorySettingsResponse>('/v1/memory/settings', {
      projectId,
    });
  },
  updateSettings(body: {
    projectId: string;
    autoRecall?: boolean;
    autoCapture?: boolean;
    adminVisibilityOptIn?: boolean;
  }) {
    return api.post<MemorySettingsResponse>('/v1/memory/settings', body);
  },
};

/**
 * Admin memory governance. Returns org/flow memory plus ONLY those member facts passing all three
 * conditions (platform unlock AND owner opt-in AND that fact marked SHARED) — enforced in one SQL
 * predicate server-side. A member's permanently-private fact is unreachable here by construction.
 */
export const adminMemoryApi = {
  overview() {
    return api.get<AdminMemoryOverviewResponse>('/v1/admin/memory');
  },
  list(params: {
    scope?: AgentMemoryScope;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return api.get<ListAdminMemoryResponse>('/v1/admin/memory/facts', params);
  },
  /** Flip the platform-wide capability. Unlocking exposes nothing on its own. */
  setSharing(unlocked: boolean) {
    return api.post<{ sharingUnlocked: boolean }>('/v1/admin/memory/sharing', {
      unlocked,
    });
  },
};
