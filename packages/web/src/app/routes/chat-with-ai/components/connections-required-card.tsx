import {
  AppConnectionStatus,
  AppConnectionWithoutSensitiveData,
} from '@intelblocks/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { Check, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { CreateOrEditConnectionDialog } from '@/app/connections/create-edit-connection-dialog';
import { Button } from '@/components/ui/button';
import { appConnectionsApi } from '@/features/connections/api/app-connections';
import { blocksHooks } from '@/features/pieces';
import { BlockIconWithBlockName } from '@/features/pieces/components/piece-icon-from-name';
import { authenticationSession } from '@/lib/authentication-session';

import { normalizeBlockName } from '../lib/message-parsers';

export function ConnectionsRequiredCard({
  connections,
  onResolve,
  projectId: selectedProjectId,
  isInteractive = true,
}: {
  connections: ConnectionRequiredData[];
  onResolve?: (payload: Record<string, unknown>) => void;
  projectId?: string | null;
  isInteractive?: boolean;
}) {
  const queryClient = useQueryClient();
  const [connectedSet, setConnectedSet] = useState<Set<string>>(new Set());
  const [existingConns, setExistingConns] = useState<
    Record<string, AppConnectionWithoutSensitiveData>
  >({});
  const [activeConnection, setActiveConnection] =
    useState<ConnectionRequiredData | null>(null);
  const [isNewConnection, setIsNewConnection] = useState(false);
  const [continued, setContinued] = useState(false);

  const activeBlockName = activeConnection
    ? normalizeBlockName(activeConnection.block)
    : null;
  const { blockModel } = blocksHooks.useBlock({
    name: activeBlockName ?? '',
    enabled: !!activeBlockName,
  });

  const connectionsKey = useMemo(
    () => connections.map((c) => c.block).join(','),
    [connections],
  );

  useEffect(() => {
    if (!isInteractive) return;
    const projectId = selectedProjectId ?? authenticationSession.getProjectId();
    if (!projectId) return;
    let cancelled = false;

    void Promise.all(
      connections.map(async (conn) => {
        const blockName = normalizeBlockName(conn.block);
        const result = await appConnectionsApi.list({
          projectId,
          blockName,
          limit: 1,
        });
        return { block: conn.block, connection: result.data[0] ?? null };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, AppConnectionWithoutSensitiveData> = {};
      const alreadyActive = new Set<string>();
      for (const { block, connection } of results) {
        if (connection) {
          map[block] = connection;
          if (connection.status === AppConnectionStatus.ACTIVE) {
            alreadyActive.add(block);
          }
        }
      }
      setExistingConns(map);
      if (alreadyActive.size > 0) {
        setConnectedSet(alreadyActive);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [connectionsKey, selectedProjectId, isInteractive]);

  const allConnected = connections.every((c) => connectedSet.has(c.block));

  if (!isInteractive) {
    return (
      <div className="rounded-xl border bg-background overflow-hidden my-2">
        {connections.map((conn) => {
          const blockName = normalizeBlockName(conn.block);
          return (
            <div
              key={conn.block}
              className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0"
            >
              <div className="relative">
                <BlockIconWithBlockName
                  blockName={blockName}
                  size="sm"
                  border={false}
                  showTooltip={false}
                />
                <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
                  <Check className="h-2 w-2 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{conn.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {t('Connected')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function openConnectionDialog({
    connection,
    isNew,
  }: {
    connection: ConnectionRequiredData;
    isNew: boolean;
  }) {
    setIsNewConnection(isNew);
    setActiveConnection(connection);
  }

  return (
    <>
      <motion.div
        className="rounded-xl border bg-background overflow-hidden my-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.3,
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
      >
        {connections.map((conn) => (
          <ConnectionRow
            key={conn.block}
            connection={conn}
            isConnected={connectedSet.has(conn.block)}
            existingConn={existingConns[conn.block] ?? null}
            onConnect={() =>
              openConnectionDialog({ connection: conn, isNew: false })
            }
            onSwitch={() =>
              openConnectionDialog({ connection: conn, isNew: true })
            }
            continued={continued}
          />
        ))}

        {allConnected && (
          <div className="border-t px-4 py-3 bg-muted/30">
            {continued ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                {t('All connected')}
              </div>
            ) : (
              onResolve && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setContinued(true);
                    const resolvedProjectId =
                      selectedProjectId ??
                      authenticationSession.getProjectId() ??
                      '';
                    const confirmedConnections = connections.map((conn) => {
                      const existing = existingConns[conn.block];
                      return {
                        block: conn.block,
                        displayName: conn.displayName,
                        connectionExternalId: existing?.externalId ?? null,
                        projectId: resolvedProjectId,
                      };
                    });
                    onResolve({
                      message: 'All connections are ready, continue building.',
                      connections: confirmedConnections,
                    });
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('Continue')}
                </Button>
              )
            )}
          </div>
        )}
      </motion.div>

      {blockModel && activeConnection && (
        <CreateOrEditConnectionDialog
          key={activeConnection.block}
          block={blockModel}
          open={true}
          projectId={selectedProjectId}
          setOpen={(open, createdConnection) => {
            if (!open) {
              if (createdConnection) {
                setExistingConns((prev) => ({
                  ...prev,
                  [activeConnection.block]: createdConnection,
                }));
                setConnectedSet((prev) => {
                  const next = new Set(prev);
                  next.add(activeConnection.block);
                  return next;
                });
                void queryClient.invalidateQueries({
                  queryKey: ['app-connections'],
                });
              }
              setActiveConnection(null);
            }
          }}
          reconnectConnection={
            isNewConnection
              ? null
              : existingConns[activeConnection.block] ?? null
          }
          isGlobalConnection={false}
        />
      )}
    </>
  );
}

function ConnectionRow({
  connection,
  isConnected,
  existingConn,
  onConnect,
  onSwitch,
  continued,
}: {
  connection: ConnectionRequiredData;
  isConnected: boolean;
  existingConn: AppConnectionWithoutSensitiveData | null;
  onConnect: () => void;
  onSwitch: () => void;
  continued: boolean;
}) {
  const blockName = normalizeBlockName(connection.block);
  const { isLoading } = blocksHooks.useBlock({ name: blockName });
  const isReconnect =
    existingConn !== null && existingConn.status !== AppConnectionStatus.ACTIVE;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0">
      <BlockIconWithBlockName
        blockName={blockName}
        size="sm"
        border={false}
        showTooltip={false}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {isConnected && existingConn
            ? existingConn.displayName
            : connection.displayName}
        </div>
        <div className="text-xs text-muted-foreground">
          {isConnected
            ? t('Ready to use')
            : isReconnect
            ? t('Your {name} connection is expired', {
                name: connection.displayName,
              })
            : t('Not connected')}
        </div>
      </div>
      {isConnected ? (
        continued ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="shrink-0 flex items-center justify-center"
          >
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
          </motion.span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={onSwitch}
          >
            <RefreshCw className="h-3 w-3" />
            {t('Switch')}
          </Button>
        )
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          disabled={isLoading}
          onClick={onConnect}
        >
          {isReconnect ? t('Reconnect') : t('Connect')}
        </Button>
      )}
    </div>
  );
}

export type ConnectionRequiredData = {
  block: string;
  displayName: string;
  status?: 'missing' | 'error';
};
