import { t } from 'i18next';
import { Link } from 'react-router-dom';

import { ChartLineIcon } from '@/components/icons/chart-line';
import { Button } from '@/components/ui/button';

// Contextual launch point to the internal-admin Chat Analytics page (capability spec H.2.m).
// Rendered on AI-adjacent / observability admin pages so operators can jump to chat usage metrics
// without hunting the sidebar. The target route is itself platform-admin-gated, and the analytics
// API is dual-gated, so this is a convenience link — not a new access path.
export function ChatAnalyticsLinkButton({
  variant = 'outline',
  size = 'sm',
}: {
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
}) {
  return (
    <Button variant={variant} size={size} asChild>
      <Link to="/platform/observability/chat-analytics">
        <ChartLineIcon className="size-4 mr-2" />
        {t('Chat Analytics')}
      </Link>
    </Button>
  );
}
