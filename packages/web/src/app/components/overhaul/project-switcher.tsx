import { ProjectType } from '@intelblocks/shared';
import { t } from 'i18next';
import { Check, ChevronsUpDown, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CreateProjectButton,
  getProjectName,
  projectCollectionUtils,
} from '@/features/projects';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

/**
 * Overhaul project switcher for the NewAppShell top bar — the new-shell counterpart of the legacy
 * ProjectDashboardSidebar's project list. Lets a user search and switch the active project (TEAM +
 * their own PERSONAL, exactly like `projectCollectionUtils.useAll()`), and create a new project
 * (reusing `CreateProjectButton`, which carries the plan/limit gate). Selecting a project switches
 * the session and lands in that project's OVERHAUL automations. The legacy sidebar switcher stays
 * live; this closes the "no project switcher in the overhaul shell" gap.
 */
export function ProjectSwitcher() {
  const { project: currentProject } =
    projectCollectionUtils.useCurrentProject();
  const { data: projects } = projectCollectionUtils.useAll();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => projects ?? [], [projects]);

  // A single project (typical single-tenant / personal-only) → nothing to switch between; hide.
  if (sorted.length <= 1) {
    return null;
  }

  const handleSelect = (projectId: string) => {
    setOpen(false);
    if (projectId === currentProject?.id) {
      return;
    }
    // Switch the stored project, then hard-navigate to that project's overhaul automations. A full
    // navigation (not client-side) mirrors the legacy switch: project-scoped collections/queries
    // re-initialise cleanly against the new project id.
    authenticationSession.switchToProject(projectId);
    window.location.href = `/projects/${projectId}/build/automations`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={t('Switch project')}
          className="h-9 max-w-[200px] gap-2"
        >
          <span className="truncate text-[13px] font-medium">
            {currentProject ? getProjectName(currentProject) : t('Project')}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end" sideOffset={8}>
        <Command>
          <CommandInput placeholder={t('Search projects...')} className="h-9" />
          <CommandList>
            <CommandEmpty>{t('No projects found.')}</CommandEmpty>
            <CommandGroup>
              {sorted.map((project) => {
                const name = getProjectName(project);
                const isCurrent = project.id === currentProject?.id;
                return (
                  <CommandItem
                    key={project.id}
                    value={`${name} ${project.id}`}
                    onSelect={() => handleSelect(project.id)}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        isCurrent ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{name}</span>
                    {project.type === ProjectType.PERSONAL && (
                      <Lock className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t px-2 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t('New project')}
            </span>
            <CreateProjectButton
              variant="icon"
              projects={sorted}
              onCreate={(project) => {
                authenticationSession.switchToProject(project.id);
                window.location.href = `/projects/${project.id}/build/automations`;
              }}
            />
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
