import { api } from '@/lib/api';

// Internal-admin chat analytics API client (capability spec H.2.m). Reads from the operator/admin
// surface at /v1/admin/chat-analytics. The endpoints are dual-gated on the server (operator key OR
// platform-admin JWT); the web client authenticates with the logged-in platform-admin's JWT, which
// `api` attaches automatically — no operator secret is ever held in the browser.

export type UsageGroupBy = 'day' | 'platform' | 'provider' | 'model';

export type UsageSummary = {
  totalMessages: number;
  totalToolCalls: number;
  distinctUsers: number;
  distinctConversations: number;
  series: Array<{
    key: string;
    messages: number;
    toolCalls: number;
    users: number;
  }>;
};

export type OrgUsageRow = {
  platformId: string;
  platformName: string | null;
  licenseKey: string | null;
  messages: number;
  toolCalls: number;
  distinctUsers: number;
  lastActivityAt: string | null;
};

export type ConversationListItem = {
  id: string;
  platformId: string;
  userId: string;
  title: string | null;
  modelName: string | null;
  status: string;
  messageCount: number;
  created: string;
  updated: string;
};

export type PersistedChatMessage = {
  role: string;
  parts: Array<Record<string, unknown>>;
};

export type ConversationDetail = ConversationListItem & {
  projectId: string | null;
  messages: PersistedChatMessage[];
};

export type RolloutFunnel = {
  landed: number;
  chatted: number;
  cap: number;
  closed: boolean;
};

export type Page<T> = { data: T[]; total: number };

export const chatAnalyticsApi = {
  usage(params: {
    from?: string;
    to?: string;
    platformId?: string;
    groupBy?: UsageGroupBy;
  }) {
    return api.get<UsageSummary>('/v1/admin/chat-analytics/usage', params);
  },
  byOrg(params: {
    from?: string;
    to?: string;
    offset?: number;
    limit?: number;
  }) {
    return api.get<Page<OrgUsageRow>>(
      '/v1/admin/chat-analytics/by-org',
      params,
    );
  },
  conversations(params: {
    platformId?: string;
    userId?: string;
    offset?: number;
    limit?: number;
  }) {
    return api.get<Page<ConversationListItem>>(
      '/v1/admin/chat-analytics/conversations',
      params,
    );
  },
  conversationDetail(id: string) {
    return api.get<ConversationDetail>(
      `/v1/admin/chat-analytics/conversations/${id}`,
    );
  },
  rolloutFunnel() {
    return api.get<RolloutFunnel>('/v1/admin/chat-analytics/rollout-funnel');
  },
};
