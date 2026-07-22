import {
  AgentMemoryScope,
  MemoryFactKind,
  MemoryVisibility,
} from '@intelblocks/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { adminMemoryApi, memoryApi } from '../api/browser-agent-api';

/**
 * Memory data layer. One set of hooks serves BOTH products — Intellisper Agent (scope USER) and
 * Intellisper Studio (scope PLATFORM for org memory, FLOW for a single flow's memory) — because the
 * only thing that differs is the scope on the wire.
 *
 * Every mutation invalidates by scope key, so the org tab does not refetch when you edit a personal
 * fact (and vice versa).
 */

export const memoryKeys = {
  all: ['browser-agent-memory'] as const,
  list: (params: Record<string, unknown>) =>
    [...memoryKeys.all, 'list', params] as const,
  settings: (projectId: string) =>
    [...memoryKeys.all, 'settings', projectId] as const,
  admin: () => [...memoryKeys.all, 'admin'] as const,
  adminList: (params: Record<string, unknown>) =>
    [...memoryKeys.admin(), 'list', params] as const,
  adminOverview: () => [...memoryKeys.admin(), 'overview'] as const,
};

/** A 402 from the memory routes means "not on your plan" — the page renders an upsell, not an error. */
export function isPaymentRequired(err: unknown): boolean {
  return api.isError(err) && err.response?.status === 402;
}

export type MemoryListParams = {
  projectId: string;
  scope: AgentMemoryScope;
  flowId?: string;
  search?: string;
  kind?: MemoryFactKind;
  page?: number;
  limit?: number;
};

export function useMemoryFacts(params: MemoryListParams, enabled = true) {
  return useQuery({
    queryKey: memoryKeys.list(params),
    queryFn: () => memoryApi.list(params),
    enabled,
    // A 402 (not on plan) is a stable answer, not a transient fault — retrying just delays the
    // upsell and burns requests.
    retry: (count, err) => !isPaymentRequired(err) && count < 2,
  });
}

export function useMemorySettings(projectId: string, enabled = true) {
  return useQuery({
    queryKey: memoryKeys.settings(projectId),
    queryFn: () => memoryApi.settings(projectId),
    enabled,
    retry: (count, err) => !isPaymentRequired(err) && count < 2,
  });
}

/** Invalidate every memory list (all scopes) — used after writes that can move a fact between views. */
function useInvalidateLists() {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({ queryKey: [...memoryKeys.all, 'list'] });
}

export function useCreateFact(projectId: string) {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (body: {
      content: string;
      kind?: MemoryFactKind;
      scope?: AgentMemoryScope;
      flowId?: string;
    }) => memoryApi.create({ projectId, ...body }),
    onSuccess: (res) => {
      // The server refuses secret-like content as a friendly non-error; surface it honestly rather
      // than claiming a save that did not happen.
      if (res.refused) {
        toast.warning(
          t('That looks like a secret, so it was not saved to memory.'),
        );
        return;
      }
      if (!res.saved) {
        toast.error(t('Could not save that memory.'));
        return;
      }
      toast.success(t('Memory saved'));
      void invalidate();
    },
    onError: () => toast.error(t('Could not save that memory.')),
  });
}

export function useUpdateFact(projectId: string) {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      content?: string;
      kind?: MemoryFactKind;
    }) => memoryApi.update(id, { projectId, ...body }),
    onSuccess: (res) => {
      if (res.refused) {
        toast.warning(t('That looks like a secret, so it was not saved.'));
        return;
      }
      toast.success(t('Memory updated'));
      void invalidate();
    },
    onError: () => toast.error(t('Could not update that memory.')),
  });
}

/**
 * The per-fact sharing veto. Marking SHARED does not itself reveal anything — the platform unlock
 * and the owner's opt-in must also hold — so the toast deliberately avoids implying exposure.
 */
export function useSetFactVisibility(projectId: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({
      id,
      visibility,
    }: {
      id: string;
      visibility: MemoryVisibility;
    }) => memoryApi.setVisibility(id, { projectId, visibility }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.visibility === MemoryVisibility.SHARED
          ? t('Marked shareable with your admin')
          : t('Marked permanently private'),
      );
      void invalidate();
      // The settings card shows a live count of shared facts.
      void client.invalidateQueries({
        queryKey: memoryKeys.settings(projectId),
      });
    },
    onError: () => toast.error(t('Could not change sharing for that memory.')),
  });
}

export function useDeleteFact(projectId: string) {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (id: string) => memoryApi.remove(id, { projectId }),
    onSuccess: () => {
      toast.success(t('Memory forgotten'));
      void invalidate();
    },
    onError: () => toast.error(t('Could not forget that memory.')),
  });
}

export function useBulkDeleteMemory(projectId: string) {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (body: { scope?: AgentMemoryScope; flowId?: string }) =>
      memoryApi.bulkDelete({ projectId, ...body }),
    onSuccess: (res) => {
      // ICU MessageFormat (i18next-icu): single braces, and `count` must be a NUMBER so the
      // plural category resolves. See i18n.ts — `.use(ICU)`.
      toast.success(
        t('Forgot {count, plural, =1 {1 memory} other {# memories}}', {
          count: res.deleted,
        }),
      );
      void invalidate();
    },
    onError: () => toast.error(t('Could not clear that memory.')),
  });
}

export function useUpdateMemorySettings(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      autoRecall?: boolean;
      autoCapture?: boolean;
      adminVisibilityOptIn?: boolean;
    }) => memoryApi.updateSettings({ projectId, ...body }),
    onSuccess: (res) => {
      client.setQueryData(memoryKeys.settings(projectId), res);
      toast.success(t('Memory settings updated'));
    },
    onError: () => toast.error(t('Could not update memory settings.')),
  });
}

/** Download a scope's facts as a JSON file (data portability). */
export function useExportMemory(projectId: string) {
  return useMutation({
    mutationFn: async (params: {
      scope?: AgentMemoryScope;
      flowId?: string;
    }) => {
      const res = await memoryApi.export({ projectId, ...params });
      const blob = new Blob([JSON.stringify(res.facts, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intellisper-memory-${(
        params.scope ?? 'USER'
      ).toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return res.facts.length;
    },
    onSuccess: (count) =>
      toast.success(
        t('Exported {count, plural, =1 {1 memory} other {# memories}}', {
          count,
        }),
      ),
    onError: () => toast.error(t('Could not export memory.')),
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────────────────────────

export function useAdminMemoryOverview() {
  return useQuery({
    queryKey: memoryKeys.adminOverview(),
    queryFn: () => adminMemoryApi.overview(),
  });
}

export function useAdminMemoryFacts(params: {
  scope?: AgentMemoryScope;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: memoryKeys.adminList(params),
    queryFn: () => adminMemoryApi.list(params),
  });
}

/**
 * Flip the platform-wide sharing capability. Locking it hides every shared fact immediately without
 * destroying any member's per-fact marks or opt-in, so this is reversible with no data loss.
 */
export function useSetMemorySharing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (unlocked: boolean) => adminMemoryApi.setSharing(unlocked),
    onSuccess: (res) => {
      toast.success(
        res.sharingUnlocked
          ? t('Member memory sharing unlocked')
          : t('Member memory sharing locked'),
      );
      void client.invalidateQueries({ queryKey: memoryKeys.admin() });
    },
    onError: () => toast.error(t('Could not change the sharing setting.')),
  });
}
