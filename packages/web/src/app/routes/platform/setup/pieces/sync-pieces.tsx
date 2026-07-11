import { IbFlagId, BlockSyncMode } from '@intelblocks/shared';
import { RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { platformBlocksMutations } from '@/features/platform-admin';
import { flagsHooks } from '@/hooks/flags-hooks';

const SyncBlocksButton = () => {
  const { data: blocksSyncMode } = flagsHooks.useFlag<string>(
    IbFlagId.BLOCKS_SYNC_MODE,
  );
  const { mutate: syncBlocks, isPending } =
    platformBlocksMutations.useSyncBlocks();

  return (
    <>
      {blocksSyncMode === BlockSyncMode.OFFICIAL_AUTO && (
        <Button
          variant={'outline'}
          onClick={() => syncBlocks()}
          loading={isPending}
          size={'sm'}
        >
          <RefreshCcw className="w-4 h-4 mr-2" /> Sync from Cloud
        </Button>
      )}
    </>
  );
};

SyncBlocksButton.displayName = 'SyncPiecesButton';
export { SyncBlocksButton };
