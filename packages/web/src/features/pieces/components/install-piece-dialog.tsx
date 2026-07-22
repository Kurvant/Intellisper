import { zodResolver } from '@hookform/resolvers/zod';
import {
  AddBlockRequestBody,
  IbFlagId,
  PackageType,
  BlockScope,
} from '@intelblocks/shared';
import { useMutation } from '@tanstack/react-query';
import { HttpStatusCode } from 'axios';
import { t } from 'i18next';
import pako from 'pako';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { IbMarkdown } from '@/components/custom/markdown';
import { PlusIcon } from '@/components/icons/plus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { flagsHooks } from '@/hooks/flags-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { blocksApi } from '../api/pieces-api';
const FormSchema = z.object({
  packageType: z.nativeEnum(PackageType),
  blockName: z.string().optional(),
  scope: z.nativeEnum(BlockScope),
  blockVersion: z.string().optional(),
  blockArchive: z.unknown().optional(),
});

type InstallBlockDialogProps = {
  onInstallBlock: () => void;
  scope: BlockScope;
};
const InstallBlockDialog = ({
  onInstallBlock,
  scope,
}: InstallBlockDialogProps) => {
  const { platform } = platformHooks.useCurrentPlatform();
  const isEnabled = platform.plan.manageBlocksEnabled;
  const [isOpen, setIsOpen] = useState(false);

  const { data: privateBlocksEnabled } = flagsHooks.useFlag<boolean>(
    IbFlagId.PRIVATE_BLOCKS_ENABLED,
  );

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      scope,
      packageType: PackageType.REGISTRY,
    },
  });

  const handleArchiveUpload = async (file: File) => {
    if (file && file.name.endsWith('.tgz')) {
      try {
        const fileBuffer = await file.arrayBuffer();
        const decompressedData = pako.ungzip(new Uint8Array(fileBuffer));
        const text = new TextDecoder().decode(decompressedData);

        // Look for package.json content in the decompressed data
        const packageJsonMatch = text.match(
          /package\.json.*?{[^}]*"name"\s*:\s*"([^"]+)".*?"version"\s*:\s*"([^"]+)"/s,
        );
        if (packageJsonMatch) {
          form.setValue('blockName', packageJsonMatch[1]);
          form.setValue('blockVersion', packageJsonMatch[2]);
        } else {
          form.setError('blockArchive', {
            message: t('package.json not found in archive'),
          });
        }
      } catch (error) {
        console.error('Error processing file:', error);
        form.setError('blockArchive', {
          message: t('Error processing archive file'),
        });
      }
    } else {
      form.setError('blockArchive', {
        message: t('Please upload a .tgz file'),
      });
    }
  };

  const { mutate, isPending } = useMutation<void, Error, AddBlockRequestBody>({
    mutationFn: async (data) => {
      form.clearErrors();

      if (data.packageType === PackageType.REGISTRY) {
        if (!data.blockName) {
          form.setError('blockName', {
            message: t('Block name is required for NPM Registry'),
          });
        }
        if (!data.blockVersion) {
          form.setError('blockVersion', {
            message: t('Block version is required for NPM Registry'),
          });
        }
        if (!data.blockName || !data.blockVersion) {
          throw new Error('Validation failed');
        }
      }

      await blocksApi.install(data);
    },
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
      onInstallBlock();
      toast.success(t('Block installed'), {
        duration: 3000,
      });
    },
    onError: (error) => {
      if (api.isError(error)) {
        switch (error.response?.status) {
          case HttpStatusCode.Conflict:
            form.setError('root.serverError', {
              message: t(
                'A block with this name and version is already installed. Please update the version number in package.json and try again.',
              ),
            });
            break;
          default:
            form.setError('root.serverError', {
              message: t('Something went wrong, please try again later'),
            });
            break;
        }
      }
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <DialogTrigger asChild>
        <AnimatedIconButton icon={PlusIcon} iconSize={16} size="sm">
          {t('Install Block')}
        </AnimatedIconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Install a block')}</DialogTitle>
          <DialogDescription>
            <IbMarkdown
              markdown={
                'Use this to install a [custom block]("https://www.activepieces.com/docs/build-pieces/building-pieces/create-action") that you (or someone else) created. Once the block is installed, you can use it in the flow builder.\n\nWarning: Make sure you trust the author as the block will have access to your flow data and it might not be compatible with the current version of Intellisper.'
              }
            />
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((data) =>
              mutate({
                projectId: authenticationSession.getProjectId()!,
                ...data,
              } as AddBlockRequestBody),
            )}
          >
            <FormField
              name="packageType"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="packageType">
                    {t('Package Type')}
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === PackageType.ARCHIVE) {
                        form.setValue('blockName', undefined);
                        form.setValue('blockVersion', undefined);
                      }
                      form.clearErrors();
                    }}
                    defaultValue={PackageType.REGISTRY}
                  >
                    <SelectTrigger>
                      <SelectValue defaultValue={PackageType.REGISTRY} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={PackageType.REGISTRY}>
                          {t('NPM Registry')}
                        </SelectItem>
                        <SelectItem
                          value={PackageType.ARCHIVE}
                          disabled={!isEnabled || !privateBlocksEnabled}
                        >
                          {t('Packed Archive (.tgz)')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('packageType') === PackageType.REGISTRY && (
              <>
                <FormField
                  name="blockName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="blockName">
                        {t('Block Name')}
                      </FormLabel>
                      <Input
                        {...field}
                        value={field.value || ''}
                        id="blockName"
                        type="text"
                        placeholder="@intelblocks/block-name"
                        className="rounded-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="blockVersion"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="blockVersion">
                        {t('Block Version')}
                      </FormLabel>
                      <Input
                        {...field}
                        value={field.value || ''}
                        id="blockVersion"
                        type="text"
                        placeholder="0.0.1"
                        className="rounded-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {form.watch('packageType') === PackageType.ARCHIVE && (
              <FormField
                name="blockArchive"
                control={form.control}
                render={({
                  field: { value: _value, onChange, ...fieldProps },
                }) => (
                  <FormItem>
                    <FormLabel htmlFor="blockArchive">
                      {t('Package Archive')}
                    </FormLabel>
                    <Input
                      {...fieldProps}
                      id="blockArchive"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onChange(file);
                          handleArchiveUpload(file);
                        }
                      }}
                      placeholder={t('Package archive')}
                      className="rounded-sm"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {form?.formState?.errors?.root?.serverError && (
              <FormMessage>
                {form.formState.errors.root.serverError.message}
              </FormMessage>
            )}
            <Button loading={isPending} type="submit">
              {t('Install')}
            </Button>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};

export { InstallBlockDialog };
