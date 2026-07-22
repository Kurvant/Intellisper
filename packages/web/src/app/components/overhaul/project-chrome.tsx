import {
  IbFlagId,
  isNil,
  Permission,
  PlatformRole,
  ProjectType,
  UserStatus,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { Lock, UsersRound } from 'lucide-react';
import { useState } from 'react';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { SettingsIcon } from '@/components/icons/settings';
import { UserRoundPlusIcon } from '@/components/icons/user-round-plus';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InviteUserDialog, projectMembersHooks } from '@/features/members';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import { IbProjectDisplay } from '@/features/projects/components/ap-project-display';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { userHooks } from '@/hooks/user-hooks';

import { ProjectSettingsDialog } from '../project-settings';

type SettingsTab = 'general' | 'members' | 'alerts' | 'pieces' | 'environment';

/**
 * Project-level chrome for the overhaul shell top bar — the NewAppShell counterpart of the legacy
 * `ProjectDashboardPageHeader` right-content cluster. Carries the three project actions that were
 * ONLY reachable from the legacy project header:
 *   1. member-count button  → opens Project Settings on the Members tab
 *   2. Add Members button    → InviteUserDialog
 *   3. settings gear         → Project Settings (first available tab)
 *
 * Every gate is reproduced verbatim from the legacy header (SHOW_PROJECT_MEMBERS flag +
 * READ_PROJECT_MEMBER for the member-count; WRITE_INVITATION + TEAM + projectRolesEnabled OR
 * platform-admin for invite; TEAM/embedding-admin for the general tab). Because this lives in the
 * shell, EVERY overhaul page gets it — closing the "settings/invite only on Home" gap. The legacy
 * header stays untouched; both coexist until legacy is removed.
 */
export function ProjectChrome() {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { platform } = platformHooks.useCurrentPlatform();
  const { data: user } = userHooks.useCurrentUser();
  const { checkAccess } = useAuthorization();
  const { projectMembers } = projectMembersHooks.useProjectMembers();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTab>('general');

  const { data: showProjectMembersFlag } = flagsHooks.useFlag<boolean>(
    IbFlagId.SHOW_PROJECT_MEMBERS,
  );

  if (isNil(project)) {
    return null;
  }

  const activeProjectMembers = projectMembers?.filter(
    (member) => member.user.status === UserStatus.ACTIVE,
  );
  const userHasPermissionToReadProjectMembers = checkAccess(
    Permission.READ_PROJECT_MEMBER,
  );
  const userHasPermissionToInviteUser = checkAccess(
    Permission.WRITE_INVITATION,
  );

  const showProjectMembersIcons =
    showProjectMembersFlag &&
    userHasPermissionToReadProjectMembers &&
    !isNil(activeProjectMembers) &&
    project.type === ProjectType.TEAM;

  const userCanInviteToProject =
    userHasPermissionToInviteUser &&
    project.type === ProjectType.TEAM &&
    platform.plan.projectRolesEnabled;
  const userCanInviteToPlatform = user?.platformRole === PlatformRole.ADMIN;
  const showInviteUserButton =
    userCanInviteToProject || userCanInviteToPlatform;

  const hasGeneralSettings =
    project.type === ProjectType.TEAM ||
    (platform.plan.embeddingEnabled &&
      user?.platformRole === PlatformRole.ADMIN);

  const getFirstAvailableTab = (): SettingsTab => {
    if (hasGeneralSettings) return 'general';
    if (
      project.type === ProjectType.TEAM &&
      showProjectMembersFlag &&
      userHasPermissionToReadProjectMembers
    )
      return 'members';
    return 'pieces';
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Current project name + personal-project lock (mirrors legacy title content). */}
        <div className="hidden items-center gap-1.5 border-r border-border/60 pr-2 md:flex">
          <IbProjectDisplay
            title={getProjectName(project)}
            maxLengthToNotShowTooltip={22}
            titleClassName="text-[13px] font-medium text-muted-foreground"
            projectType={project.type}
          />
          {project.type === ProjectType.PERSONAL && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t(
                      'This is your private project. Only you can see and access it.',
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {showProjectMembersIcons && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2"
            aria-label={`View ${activeProjectMembers?.length} team member${
              activeProjectMembers?.length !== 1 ? 's' : ''
            }`}
            onClick={() => {
              setSettingsInitialTab('members');
              setSettingsOpen(true);
            }}
          >
            <UsersRound className="size-4" />
            <span className="text-sm font-medium">
              {activeProjectMembers?.length}
            </span>
          </Button>
        )}

        {showInviteUserButton && (
          <AnimatedIconButton
            icon={UserRoundPlusIcon}
            iconSize={16}
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setInviteOpen(true)}
          >
            <span className="text-sm font-medium">{t('Add Members')}</span>
          </AnimatedIconButton>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t('Project settings')}
              onClick={() => {
                setSettingsInitialTab(getFirstAvailableTab());
                setSettingsOpen(true);
              }}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('Project settings')}</TooltipContent>
        </Tooltip>
      </div>

      <InviteUserDialog open={inviteOpen} setOpen={setInviteOpen} />
      <ProjectSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsInitialTab}
        initialValues={{ projectName: project?.displayName }}
      />
    </>
  );
}
