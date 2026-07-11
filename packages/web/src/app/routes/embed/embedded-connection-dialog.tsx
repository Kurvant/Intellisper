import {
  ibId,
  AppConnectionWithoutSensitiveData,
  isNil,
} from '@intelblocks/shared';
import {
  IntellisperClientConnectionNameIsInvalid,
  IntellisperClientConnectionPieceNotFound,
  IntellisperClientEventName,
  IntellisperClientShowConnectionIframe,
  IntellisperNewConnectionDialogClosed,
  NEW_CONNECTION_QUERY_PARAMS,
} from 'ee-embed-sdk';
import { useEffect, useRef, useState } from 'react';

import { memoryRouter } from '@/app/guards';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { oauthAppsQueries } from '@/features/connections';
import { blocksHooks } from '@/features/pieces';
import { parentWindow } from '@/lib/dom-utils';
import { cn } from '@/lib/utils';

import { CreateOrEditConnectionDialogContent } from '../../connections/create-edit-connection-dialog';

const extractIdFromQueryParams = () => {
  const connectionName = new URLSearchParams(
    memoryRouter.state.location.search,
  ).get(NEW_CONNECTION_QUERY_PARAMS.connectionName);
  return isNil(connectionName) || connectionName.length === 0
    ? ibId()
    : connectionName;
};
export const EmbeddedConnectionDialog = () => {
  const connectionName = extractIdFromQueryParams();
  const queryParams = new URLSearchParams(memoryRouter.state.location.search);
  const blockName = queryParams.get(NEW_CONNECTION_QUERY_PARAMS.name);
  const randomId = queryParams.get(NEW_CONNECTION_QUERY_PARAMS.randomId);
  return (
    <EmbeddedConnectionDialogContent
      connectionName={
        connectionName && connectionName.length > 0 ? connectionName : null
      }
      blockName={blockName}
      key={randomId}
    ></EmbeddedConnectionDialogContent>
  );
};

type EmbeddedConnectionDialogContentProps = {
  blockName: string | null;
  connectionName: string | null;
};

const EmbeddedConnectionDialogContent = ({
  blockName,
  connectionName,
}: EmbeddedConnectionDialogContentProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(true);
  const hasErrorRef = useRef(false);

  const {
    data: blockModel,
    isLoading: isLoadingBlock,
    isSuccess,
  } = blocksHooks.useBlockForEmbeddingConnection({
    blockName: blockName ?? '',
    connectionExternalId: connectionName ?? '',
  });
  const hideConnectionIframe = (
    connection?: Pick<AppConnectionWithoutSensitiveData, 'id' | 'externalId'>,
  ) => {
    postMessageToParent({
      type: IntellisperClientEventName.CLIENT_NEW_CONNECTION_DIALOG_CLOSED,
      data: {
        connection: connection
          ? {
              id: connection.id,
              name: connection.externalId,
            }
          : undefined,
      },
    });
  };

  const postMessageToParent = (
    event:
      | IntellisperNewConnectionDialogClosed
      | IntellisperClientConnectionNameIsInvalid
      | IntellisperClientConnectionPieceNotFound,
  ) => {
    parentWindow.postMessage(event, '*');
  };
  useEffect(() => {
    const showConnectionIframeEvent: IntellisperClientShowConnectionIframe = {
      type: IntellisperClientEventName.CLIENT_SHOW_CONNECTION_IFRAME,
      data: {},
    };
    parentWindow.postMessage(showConnectionIframeEvent, '*');
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    if (!isSuccess && !isLoadingBlock && !hasErrorRef.current) {
      postMessageToParent({
        type: IntellisperClientEventName.CLIENT_CONNECTION_PIECE_NOT_FOUND,
        data: {
          error: JSON.stringify({
            isValid: 'false',
            error: `piece: ${blockName} not found`,
          }),
        },
      });
      hideConnectionIframe();
      hasErrorRef.current = true;
    }
  }, [isSuccess, isLoadingBlock, blockName]);

  const { data: blocksOAuth2AppsMap, isPending: loadingBlocksOAuth2AppsMap } =
    oauthAppsQueries.useBlocksOAuth2AppsMap();
  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          hideConnectionIframe();
        }
      }}
    >
      <DialogContent
        showOverlay={false}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'max-h-[70vh]  min-w-[450px] max-w-[450px] lg:min-w-[650px] lg:max-w-[650px] overflow-y-auto',
          {
            'bg-transparent! border-none! focus:outline-hidden border-transparent! shadow-none!':
              isLoadingBlock,
          },
        )}
        showCloseButton={!isLoadingBlock}
      >
        {isLoadingBlock ||
          (loadingBlocksOAuth2AppsMap && (
            <div className="flex justify-center items-center">
              <LoadingSpinner className="stroke-background size-[50px]"></LoadingSpinner>
            </div>
          ))}

        {!isLoadingBlock && blockModel && blocksOAuth2AppsMap && (
          <CreateOrEditConnectionDialogContent
            reconnectConnection={null}
            blocksOAuth2AppsMap={blocksOAuth2AppsMap}
            block={blockModel}
            externalIdComingFromSdk={connectionName}
            isGlobalConnection={false}
            setOpen={(open, connection) => {
              if (!open) {
                hideConnectionIframe(connection);
              }
              setIsDialogOpen(open);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
