import { isNil } from '@intelblocks/shared';
import { Navigate, useLocation, useParams } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { TemplateDetailsPage } from '@/app/routes/templates/id';
import { LoadingScreen } from '@/components/custom/loading-screen';
import { templatesHooks } from '@/features/templates';
import { authenticationSession } from '@/lib/authentication-session';
import { FROM_QUERY_PARAM } from '@/lib/navigation-utils';

/**
 * Overhaul template detail (Build → Explore). The new-shell counterpart of the legacy
 * `TemplateDetailsWrapper`: it fetches the template and renders the SAME immersive full-screen
 * `TemplateDetailsPage` (flow preview canvas, Use Template, Setup guide, share, tags, blocks) — the
 * only differences are that its back button + share link point at `/build/explore` (via
 * `variant="overhaul"`) and it is NOT wrapped in the legacy `ProjectDashboardLayout`. The preview is
 * a viewport-filling surface (`absolute inset-0`) in both designs, so no `NewAppShell` chrome is
 * imposed on top of it. Login-gated (this route only mounts for authenticated users), so the
 * legacy wrapper's SHARED/unauthenticated branch isn't needed here. The old
 * `/templates/:templateId` route stays live and untouched.
 */
export function OverhaulTemplateDetailsPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const location = useLocation();
  const { data: template, isLoading } = templatesHooks.useTemplate(templateId!);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!template) {
    return <Navigate to="/build/explore" replace />;
  }

  // Belt-and-suspenders: this route is registered behind the logged-in guard, but if a token is
  // somehow absent, bounce to sign-in preserving the return path (mirrors the legacy wrapper).
  if (isNil(authenticationSession.getToken())) {
    return (
      <Navigate
        to={`/sign-in?${FROM_QUERY_PARAM}=${location.pathname}${location.search}`}
        replace
      />
    );
  }

  return (
    <PageTitle title={template.name}>
      <TemplateDetailsPage template={template} variant="overhaul" />
    </PageTitle>
  );
}

export default OverhaulTemplateDetailsPage;
