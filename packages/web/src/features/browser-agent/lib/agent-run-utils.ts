import { AgentRunStatus } from '@intelblocks/shared';
import {
  Ban,
  CheckCircle,
  Circle,
  Clock,
  Loader,
  LucideIcon,
  XCircle,
} from 'lucide-react';

/**
 * Maps an agent run status to the badge variant + icon used by StatusIconWithText.
 * Mirrors flowRunUtils.getStatusIcon. The `variant` values line up with the
 * StatusIconWithText variants ('success' | 'error' | 'default' | 'secondary'),
 * which in turn map to the Badge variants success/destructive/accent/secondary.
 */
export const agentRunUtils = {
  getStatusIcon(status: AgentRunStatus): {
    variant: 'success' | 'error' | 'default' | 'secondary';
    Icon: LucideIcon;
    spin?: boolean;
  } {
    switch (status) {
      case AgentRunStatus.COMPLETED:
        return { variant: 'success', Icon: CheckCircle };
      case AgentRunStatus.FAILED:
        return { variant: 'error', Icon: XCircle };
      case AgentRunStatus.HALTED:
        return { variant: 'error', Icon: Ban };
      case AgentRunStatus.RUNNING:
        return { variant: 'default', Icon: Loader, spin: true };
      case AgentRunStatus.AWAITING_CONFIRMATION:
        return { variant: 'default', Icon: Clock };
      case AgentRunStatus.PENDING:
        return { variant: 'secondary', Icon: Circle };
    }
  },
};

/** A run is non-terminal while it is still (or may still be) executing. */
export function isAgentRunNonTerminal(status: AgentRunStatus): boolean {
  return (
    status === AgentRunStatus.RUNNING ||
    status === AgentRunStatus.PENDING ||
    status === AgentRunStatus.AWAITING_CONFIRMATION
  );
}

/** Billed-token cost arrives as a bigint-backed string; render it grouped. */
export function formatTokens(str: string): string {
  const n = Number(str);
  return Number.isFinite(n) ? n.toLocaleString() : str;
}
