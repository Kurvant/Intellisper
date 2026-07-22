import { zodResolver } from '@hookform/resolvers/zod';
import { BlocksFilterType } from '@intelblocks/shared';
import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { blocksHooks } from '@/features/pieces';
import { projectCollectionUtils } from '@/features/projects';

import { MultiSelectBlockProperty } from '../../../../components/custom/multi-select-piece-property';
import { authenticationSession } from '../../../../lib/authentication-session';

type ManageBlocksDialogProps = {
  onSuccess: () => void;
};

export const ManageBlocksDialog = React.memo(
  ({ onSuccess }: ManageBlocksDialogProps) => {
    const [open, setOpen] = useState(false);
    const { blocks: visibleBlocks, isLoading: isLoadingVisibleBlocks } =
      blocksHooks.useBlocks({ searchQuery: '', includeHidden: false });
    useEffect(() => {
      form.setValue(
        'blocks',
        (visibleBlocks ?? []).map((p) => p.name),
      );
    }, [isLoadingVisibleBlocks]);
    const form = useForm<{
      blocks: string[];
    }>({
      resolver: zodResolver(
        z.object({
          blocks: z.array(z.string()),
        }),
      ),
      defaultValues: {
        blocks: (visibleBlocks ?? []).map((p) => p.name),
      },
    });

    const { blocks: allBlocks, isLoading: isLoadingAllBlocks } =
      blocksHooks.useBlocks({ searchQuery: '', includeHidden: true });

    return (
      <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
        <DialogTrigger asChild>
          <Button variant="default" className="flex gap-2 items-center">
            {t('Manage Blocks')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Manage Blocks')}</DialogTitle>
            <DialogDescription>
              {t(
                'Choose which blocks you want to be available for your current project users',
              )}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="flex flex-col gap-4 mb-4">
              <FormField
                name="pieces"
                render={({ field }) => (
                  <FormItem className="grid space-y-2">
                    <Label htmlFor="pieces">{t('Blocks')}</Label>
                    <MultiSelectBlockProperty
                      placeholder={t('Blocks')}
                      options={
                        allBlocks?.map((block) => ({
                          value: block.name,
                          label: block.displayName,
                        })) ?? []
                      }
                      loading={isLoadingAllBlocks || isLoadingVisibleBlocks}
                      onChange={(e) => {
                        field.onChange(e);
                      }}
                      initialValues={field.value}
                      showDeselect={field.value.length > 0}
                    ></MultiSelectBlockProperty>
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              variant={'outline'}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                form.handleSubmit(() => {
                  projectCollectionUtils.update(
                    authenticationSession.getProjectId()!,
                    {
                      plan: {
                        blocksFilterType: BlocksFilterType.ALLOWED,
                        blocks: form.getValues().blocks,
                      },
                    },
                  );
                  onSuccess();
                  setOpen(false);
                })(e);
              }}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
ManageBlocksDialog.displayName = 'ManagePiecesDialog';
