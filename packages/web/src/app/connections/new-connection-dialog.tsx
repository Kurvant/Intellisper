import { BlockMetadataModelSummary } from '@intelblocks/blocks-framework';
import { AppConnectionWithoutSensitiveData, isNil } from '@intelblocks/shared';
import { t } from 'i18next';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { blocksHooks } from '@/features/pieces';

import { CreateOrEditConnectionDialog } from './create-edit-connection-dialog';

type NewConnectionDialogProps = {
  onConnectionCreated: (connection: AppConnectionWithoutSensitiveData) => void;
  children: React.ReactNode;
  isGlobalConnection: boolean;
};

const NewConnectionDialog = React.memo(
  ({
    onConnectionCreated,
    children,
    isGlobalConnection,
  }: NewConnectionDialogProps) => {
    const [dialogTypesOpen, setDialogTypesOpen] = useState(false);
    const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
    const [selectedBlock, setSelectedBlock] = useState<
      BlockMetadataModelSummary | undefined
    >(undefined);
    const { blocks, isLoading } = blocksHooks.useBlocks({});
    const [searchTerm, setSearchTerm] = useState('');

    const filteredBlocks = blocks?.filter((block) => {
      return (
        !isNil(block.auth) &&
        block.displayName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    const clickBlock = (name: string) => {
      setDialogTypesOpen(false);
      setSelectedBlock(blocks?.find((block) => block.name === name));
      setConnectionDialogOpen(true);
    };

    return (
      <>
        {selectedBlock && (
          <CreateOrEditConnectionDialog
            reconnectConnection={null}
            block={selectedBlock}
            open={connectionDialogOpen}
            isGlobalConnection={isGlobalConnection}
            key={`CreateOrEditConnectionDialog-open-${connectionDialogOpen}`}
            setOpen={(open, connection) => {
              setConnectionDialogOpen(open);
              if (connection) {
                onConnectionCreated(connection);
              }
            }}
          ></CreateOrEditConnectionDialog>
        )}
        <Dialog
          open={dialogTypesOpen}
          onOpenChange={(open) => {
            setDialogTypesOpen(open);
            setSearchTerm('');
          }}
        >
          <DialogTrigger asChild>{children}</DialogTrigger>
          <DialogContent className="min-w-[700px] max-w-[700px] h-[680px] max-h-[680px] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t('New Connection')}</DialogTitle>
            </DialogHeader>
            <div className="mb-4">
              <Input
                placeholder={t('Search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <ScrollArea className="grow overflow-y-auto ">
              <div className="grid grid-cols-4 gap-4">
                {(isLoading ||
                  (filteredBlocks && filteredBlocks.length === 0)) && (
                  <div className="text-center">{t('No blocks found')}</div>
                )}
                {!isLoading &&
                  filteredBlocks &&
                  filteredBlocks.map((block, index) => (
                    <div
                      key={index}
                      onClick={() => clickBlock(block.name)}
                      className="border p-2 h-[150px] w-[150px] flex flex-col items-center justify-center hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-lg"
                    >
                      <img
                        className="w-[40px] h-[40px]"
                        src={block.logoUrl}
                      ></img>
                      <div className="mt-2 text-center text-md">
                        {block.displayName}
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {t('Close')}
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

NewConnectionDialog.displayName = 'NewConnectionDialog';
export { NewConnectionDialog };
