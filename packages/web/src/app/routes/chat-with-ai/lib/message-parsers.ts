import { AppConnectionStatus } from '@intelblocks/shared';

import { ChatUIMessage } from '@/features/chat/lib/chat-types';

export function normalizeBlockName(block: string): string {
  const shortName = block.replace(/[^a-z0-9-]/gi, '');
  return block.startsWith('@intelblocks/')
    ? block
    : `@intelblocks/block-${shortName}`;
}

export function isConnectionHealthy(status: string): boolean {
  return status === AppConnectionStatus.ACTIVE;
}

export function getTextFromParts(parts: ChatUIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export type { MultiQuestion } from '@/features/chat/lib/chat-store-types';

export type ConnectionPickerData = {
  block: string;
  displayName: string;
  connections?: Array<{
    label: string;
    project: string;
    externalId: string;
    projectId: string;
    status: AppConnectionStatus;
  }>;
};

export type ProjectPickerData = {
  suggestedProjects: Array<{
    name: string;
    id: string;
  }>;
};
