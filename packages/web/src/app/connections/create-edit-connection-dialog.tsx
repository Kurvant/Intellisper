import { zodResolver } from '@hookform/resolvers/zod';
import {
  getAuthPropertyForValue,
  BlockAuthProperty,
  BlockMetadataModel,
  BlockMetadataModelSummary,
  PropertyType,
} from '@intelblocks/blocks-framework';
import {
  IbFlagId,
  AppConnectionScope,
  AppConnectionType,
  AppConnectionWithoutSensitiveData,
  BOTH_CLIENT_CREDENTIALS_AND_AUTHORIZATION_CODE,
  isNil,
  UpsertAppConnectionRequestBody,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { Resolver, useForm } from 'react-hook-form';

import { IbMarkdown } from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormError,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SkeletonList } from '@/components/ui/skeleton';
import {
  ProjectSelector,
  appConnectionsMutations,
  oauthAppsQueries,
  oauth2Utils,
  BlocksOAuth2AppsMap,
  newConnectionUtils,
} from '@/features/connections';
import { formUtils } from '@/features/pieces';
import { flagsHooks } from '@/hooks/flags-hooks';

import { BasicAuthConnectionSettings } from './basic-secret-connection-settings';
import { CustomAuthConnectionSettings } from './custom-auth-connection-settings';
import { MutliAuthList, AuthListItem } from './multi-auth-list';
import { OAuth2ConnectionSettings } from './oauth2-connection-settings';
import { SecretTextConnectionSettings } from './secret-text-connection-settings';

function CreateOrEditConnectionSection({
  block,
  reconnectConnection,
  isGlobalConnection,
  externalIdComingFromSdk,
  setOpen,
  selectedAuth,
  onTryAnotherMethodButtonClicked,
  showTryAnotherMethodButton,
  projectId: projectIdOverride,
}: CreateOrEditConnectionSectionProps) {
  const formSchema = formUtils.buildConnectionSchema(
    selectedAuth.authProperty,
    {
      isGlobalConnection,
      showConnectionNameField:
        isNil(externalIdComingFromSdk) || externalIdComingFromSdk === '',
    },
  );
  const { externalId, displayName } = newConnectionUtils.getConnectionName(
    block,
    reconnectConnection,
    externalIdComingFromSdk,
  );
  const { data: redirectUrl } = flagsHooks.useFlag<string>(
    IbFlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
  );
  const form = useForm<ConnectionFormValues>({
    defaultValues: {
      request: {
        ...newConnectionUtils.createDefaultValues({
          auth: selectedAuth.authProperty,
          suggestedExternalId: externalId,
          suggestedDisplayName: displayName,
          blockName: block.name,
          oauth2App: selectedAuth.oauth2App,
          grantType: selectedAuth.grantType,
          redirectUrl: redirectUrl ?? '',
          projectId: projectIdOverride ?? undefined,
        }),
        ...(isGlobalConnection ? { scope: AppConnectionScope.PLATFORM } : {}),
        projectIds: reconnectConnection?.projectIds ?? [],
        preSelectForNewProjects: false,
        blockVersion: block.version,
      },
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
    resolver: zodResolver(
      formSchema,
    ) as unknown as Resolver<ConnectionFormValues>,
  });

  const [errorMessage, setErrorMessage] = useState('');

  const { mutate: upsertConnection, isPending } =
    appConnectionsMutations.useUpsertAppConnection({
      isGlobalConnection,
      reconnectConnection,
      externalIdComingFromSdk,
      setErrorMessage,
      form,
      setOpen,
    });

  return (
    <>
      <DialogHeader className="mb-0">
        <DialogTitle className="px-5">
          <div className="flex items-center gap-2">
            {reconnectConnection
              ? t('Reconnect {displayName} Connection', {
                  displayName: reconnectConnection.displayName,
                })
              : t('Connect to {displayName}', {
                  displayName: block.displayName,
                })}
          </div>
        </DialogTitle>
      </DialogHeader>

      <Form {...form}>
        <form className="flex flex-col gap-3">
          <ScrollArea
            className="px-2"
            viewPortClassName="max-h-[calc(70vh-180px)] px-4 py-2 mb-1"
          >
            {' '}
            <IbMarkdown
              markdown={selectedAuth.authProperty.description}
              variables={{
                redirectUrl: redirectUrl ?? '',
              }}
            ></IbMarkdown>
            {selectedAuth.authProperty.description && (
              <Separator className="my-4" />
            )}
            {(isNil(externalIdComingFromSdk) ||
              externalIdComingFromSdk === '') && (
              <FormField
                name="request.displayName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel htmlFor="displayName" showRequiredIndicator>
                      {t('Connection Name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        required
                        id="displayName"
                        type="text"
                        placeholder={t('Connection name')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              ></FormField>
            )}
            {isGlobalConnection && isNil(reconnectConnection) && (
              <div className="my-4 flex flex-col gap-4">
                <ProjectSelector
                  control={form.control}
                  name="request.projectIds"
                />
                <FormField
                  control={form.control}
                  name="request.preSelectForNewProjects"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3">
                      <Checkbox
                        id="preSelectForNewProjects"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label
                        htmlFor="preSelectForNewProjects"
                        className="cursor-pointer"
                      >
                        {t('Include by default in new projects')}
                      </Label>
                    </FormItem>
                  )}
                />
                {isNil(reconnectConnection) && (
                  <div>
                    <FormField
                      control={form.control}
                      name="request.externalId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('External ID')}</FormLabel>
                          <Input {...field} />
                          <FormMessage />
                        </FormItem>
                      )}
                    ></FormField>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3.5">
              <ConnectionSettings selectedAuth={selectedAuth} block={block} />
            </div>
          </ScrollArea>
          {errorMessage && (
            <FormError
              formMessageId="create-connection-server-error-message"
              className="text-left px-6"
            >
              {errorMessage}
            </FormError>
          )}
          <DialogFooter className="mt-0">
            <div className="mx-5 flex gap-2 w-full">
              {showTryAnotherMethodButton && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={onTryAnotherMethodButtonClicked}
                >
                  {t('Try another method')}
                </Button>
              )}
              <div className="grow"></div>
              <DialogClose asChild>
                <Button variant="outline">{t('Cancel')}</Button>
              </DialogClose>
              <Button
                onClick={(e) => form.handleSubmit(() => upsertConnection())(e)}
                loading={isPending}
                type="submit"
              >
                {t('Save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
function ConnectionSettings({ selectedAuth, block }: ConnectionSettingsProps) {
  switch (selectedAuth.authProperty.type) {
    case PropertyType.SECRET_TEXT:
      return (
        <SecretTextConnectionSettings
          authProperty={selectedAuth.authProperty}
        />
      );
    case PropertyType.BASIC_AUTH:
      return (
        <BasicAuthConnectionSettings authProperty={selectedAuth.authProperty} />
      );
    case PropertyType.CUSTOM_AUTH:
      return (
        <CustomAuthConnectionSettings
          authProperty={selectedAuth.authProperty}
        />
      );
    case PropertyType.OAUTH2:
      if (isNil(selectedAuth.grantType) || isNil(selectedAuth.oauth2App)) {
        return <div>Error: Grant type and OAuth2 app are required</div>;
      }
      return (
        <OAuth2ConnectionSettings
          authProperty={selectedAuth.authProperty}
          block={block}
          grantType={selectedAuth.grantType}
          oauth2App={selectedAuth.oauth2App}
        />
      );
  }
}

function CreateOrEditConnectionDialogContent(
  props: CreateOrEditConnectionDialogContentProps,
) {
  const block = props.block;
  const [selectedAuth, setSelectedAuth] = useState<AuthListItem | null>(
    block.auth
      ? getInitiallySelectedAuthListItem(
          block.auth,
          props.reconnectConnection,
          props.blocksOAuth2AppsMap,
          block.name,
        )
      : null,
  );
  const [showMultiAuthList, setShowMultiAuthList] = useState(false);
  if (isNil(block.auth)) {
    return null;
  }
  const hasPredefinedOAuth2App = !isNil(
    oauth2Utils.getPredefinedOAuth2App(props.blocksOAuth2AppsMap, block.name),
  );
  const hasMultipleAuth =
    Array.isArray(block.auth) ||
    doesAuthPropertySupportBothGrantTypes(block.auth) ||
    hasPredefinedOAuth2App;
  return (
    <>
      {!showMultiAuthList && selectedAuth && (
        <CreateOrEditConnectionSection
          {...props}
          selectedAuth={selectedAuth}
          onTryAnotherMethodButtonClicked={() => setShowMultiAuthList(true)}
          showTryAnotherMethodButton={hasMultipleAuth}
        />
      )}
      {showMultiAuthList && hasMultipleAuth && block.auth && selectedAuth && (
        <MutliAuthList
          blockName={block.name}
          blocksOAuth2AppsMap={props.blocksOAuth2AppsMap}
          selectedItem={selectedAuth}
          blockAuth={Array.isArray(block.auth) ? block.auth : [block.auth]}
          setSelectedItem={setSelectedAuth}
          confirmSelectedItem={() => {
            setShowMultiAuthList(false);
          }}
        />
      )}
    </>
  );
}

CreateOrEditConnectionDialogContent.displayName =
  'CreateOrEditConnectionDialogContent';

function CreateOrEditConnectionDialog({
  block,
  open,
  setOpen,
  reconnectConnection,
  isGlobalConnection,
  externalIdComingFromSdk,
  projectId: projectIdOverride,
}: ConnectionDialogProps) {
  const { data: blocksOAuth2AppsMap, isPending: loadingBlocksOAuth2AppsMap } =
    oauthAppsQueries.useBlocksOAuth2AppsMap();
  return (
    <Dialog open={open} onOpenChange={(open) => setOpen(open)} key={block.name}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[70vh] px-0  min-w-[450px] max-w-[450px] lg:min-w-[650px] lg:max-w-[650px] overflow-y-auto"
      >
        {loadingBlocksOAuth2AppsMap && hasOAuth2BlockAuth(block) ? (
          <>
            <DialogHeader className="mb-0">
              <DialogTitle className="px-5">
                <div className="flex items-center gap-2">
                  {reconnectConnection
                    ? t('Reconnect {displayName} Connection', {
                        displayName: reconnectConnection.displayName,
                      })
                    : t('Connect to {displayName}', {
                        displayName: block.displayName,
                      })}
                </div>
              </DialogTitle>
            </DialogHeader>
            <SkeletonList numberOfItems={4} className="h-7 mt-2"></SkeletonList>
          </>
        ) : (
          <CreateOrEditConnectionDialogContent
            block={block}
            blocksOAuth2AppsMap={blocksOAuth2AppsMap ?? {}}
            setOpen={setOpen}
            reconnectConnection={reconnectConnection}
            isGlobalConnection={isGlobalConnection}
            externalIdComingFromSdk={externalIdComingFromSdk}
            projectId={projectIdOverride}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function hasOAuth2BlockAuth(
  block: BlockMetadataModelSummary | BlockMetadataModel,
) {
  if (isNil(block.auth)) {
    return false;
  }
  if (Array.isArray(block.auth)) {
    return block.auth.some((auth) => auth.type === PropertyType.OAUTH2);
  }
  return block.auth.type === PropertyType.OAUTH2;
}

CreateOrEditConnectionDialog.displayName = 'CreateOrEditConnectionDialog';
export { CreateOrEditConnectionDialog, CreateOrEditConnectionDialogContent };

function getInitallySelectedAuthProperty(
  auth: BlockAuthProperty[] | BlockAuthProperty,
  reconnectConnection: AppConnectionWithoutSensitiveData | null,
): BlockAuthProperty | undefined {
  if (Array.isArray(auth)) {
    if (reconnectConnection) {
      return getAuthPropertyForValue({
        authValueType: reconnectConnection.type,
        pieceAuth: auth,
      });
    }
    return auth.at(0);
  }
  return auth;
}

function getInitiallySelectedAuthListItem(
  auth: BlockAuthProperty[] | BlockAuthProperty,
  reconnectConnection: AppConnectionWithoutSensitiveData | null,
  blocksOAuth2AppsMap: BlocksOAuth2AppsMap,
  blockName: string,
): AuthListItem | null {
  const authProperty = getInitallySelectedAuthProperty(
    auth,
    reconnectConnection,
  );
  if (!authProperty) {
    return null;
  }
  if (authProperty.type === PropertyType.OAUTH2) {
    return {
      authProperty,
      grantType: oauth2Utils.getGrantType(authProperty),
      oauth2App: oauth2Utils.getPredefinedOAuth2App(
        blocksOAuth2AppsMap,
        blockName,
      ) ?? {
        oauth2Type: AppConnectionType.OAUTH2,
        clientId: null,
      },
    };
  }
  return {
    authProperty,
    grantType: null,
    oauth2App: null,
  };
}
function doesAuthPropertySupportBothGrantTypes(
  authProperty: BlockAuthProperty | BlockAuthProperty[],
): boolean {
  if (Array.isArray(authProperty)) {
    return authProperty.some(doesAuthPropertySupportBothGrantTypes);
  }
  return (
    authProperty.type === PropertyType.OAUTH2 &&
    authProperty.grantType === BOTH_CLIENT_CREDENTIALS_AND_AUTHORIZATION_CODE
  );
}
type ConnectionDialogProps = {
  block: BlockMetadataModelSummary | BlockMetadataModel;
  open: boolean;
  setOpen: (
    open: boolean,
    connection?: AppConnectionWithoutSensitiveData,
  ) => void;
  reconnectConnection: AppConnectionWithoutSensitiveData | null;
  isGlobalConnection: boolean;
  externalIdComingFromSdk?: string | null;
  projectId?: string | null;
};

type CreateOrEditConnectionDialogContentProps = {
  block: BlockMetadataModelSummary | BlockMetadataModel;
  blocksOAuth2AppsMap: BlocksOAuth2AppsMap;
  reconnectConnection: AppConnectionWithoutSensitiveData | null;
  isGlobalConnection: boolean;
  externalIdComingFromSdk?: string | null;
  setOpen: (
    open: boolean,
    connection?: AppConnectionWithoutSensitiveData,
  ) => void;
  projectId?: string | null;
};

type CreateOrEditConnectionSectionProps =
  CreateOrEditConnectionDialogContentProps & {
    onTryAnotherMethodButtonClicked: () => void;
    showTryAnotherMethodButton: boolean;
    selectedAuth: AuthListItem;
  };

type ConnectionSettingsProps = {
  block: BlockMetadataModelSummary | BlockMetadataModel;
  selectedAuth: AuthListItem;
};

type ConnectionFormValues = {
  request: UpsertAppConnectionRequestBody & {
    projectIds: string[];
    preSelectForNewProjects: boolean;
    scope?: AppConnectionScope;
  };
};
