import { AdminMemoryPage } from '@/features/browser-agent/memory/admin-memory-page';

/**
 * Platform-admin memory governance (Admin → Observability → Memory).
 *
 * Exported bare: `adminPage()` in ../index.tsx supplies OverhaulAdminShell, the page title and the
 * suspense boundary, exactly as it does for Agent Activity and AI Spend.
 *
 * The route is platform-admin gated by the admin shell, and the API adds two further layers:
 * `platformAdminOnly` on every endpoint, and the three-condition gate on the data itself — so a
 * member's private fact is unreachable here no matter how this page is reached.
 */
export default function OverhaulAdminMemoryPage() {
  return <AdminMemoryPage />;
}
