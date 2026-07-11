import { t } from 'i18next';
import { Eye, EyeOff, Pin, PinOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { platformBlocksMutations } from '@/features/platform-admin';
import { platformHooks } from '@/hooks/platform-hooks';

type BlockActionsProps = {
  blockName: string;
  isEnabled: boolean;
};

const BlockActions = ({ blockName, isEnabled }: BlockActionsProps) => {
  const { platform, refetch } = platformHooks.useCurrentPlatform();

  const { mutate: toggleBlock, isPending: isTogglePending } =
    platformBlocksMutations.useToggleBlockVisibility({
      platformId: platform.id,
      filteredBlockNames: platform.filteredBlockNames,
      refetch,
    });
  const { mutate: togglePin, isPending: isPinPending } =
    platformBlocksMutations.useToggleBlockPin({
      platformId: platform.id,
      pinnedBlocks: platform.pinnedBlocks,
      refetch,
    });

  const filtered = platform.filteredBlockNames.includes(blockName);
  const pinned = platform.pinnedBlocks.includes(blockName);

  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={'sm'}
            loading={isTogglePending}
            disabled={!isEnabled}
            onClick={(e) => {
              if (!isEnabled) {
                e.preventDefault();
                return;
              }
              toggleBlock(blockName);
            }}
          >
            {filtered ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {filtered
            ? t('Hide this block from all projects')
            : t('Show this block for all projects')}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={'sm'}
            loading={isPinPending}
            disabled={!isEnabled}
            onClick={(e) => {
              if (!isEnabled) {
                e.preventDefault();
                return;
              }
              togglePin(blockName);
            }}
          >
            {pinned ? (
              <PinOff className="size-4" />
            ) : (
              <Pin className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {pinned ? t('Unpin this block') : t('Pin this block')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

BlockActions.displayName = 'BlockActions';

export { BlockActions };
