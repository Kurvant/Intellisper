import {
  AppConnectionScope,
  AppConnectionStatus,
  AppConnectionWithoutSensitiveData,
  PlatformRole,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { AlertTriangle, CalendarClock, Globe, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ReconnectButtonDialog } from '@/app/connections/reconnect-button-dialog';
import { IbAvatar } from '@/components/custom/ap-avatar';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  EditGlobalConnectionDialog,
  RenameConnectionDialog,
  appConnectionUtils,
} from '@/features/connections';
import { BlockIconWithBlockName } from '@/features/pieces';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

/**
 * A single app connection as a glass-bento card (gallery presentation). Same capabilities as the
 * table row — select, block icon + name, External-ID subtitle, global (Globe) badge, status badge,
 * connected-at, Flows-count link, owner avatar, and rename / edit-global / reconnect actions
 * (reusing the exact same dialogs and permission gates) — just a glassmorphism layout/feel.
 */
export function OvConnectionCard({
  connection,
  index,
  isSelected,
  onToggleSelect,
  onRefetch,
  userHasPermissionToWriteAppConnection,
  userPlatformRole,
  showOwner,
}: {
  connection: AppConnectionWithoutSensitiveData;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRefetch: () => void;
  userHasPermissionToWriteAppConnection: boolean;
  userPlatformRole: PlatformRole | null | undefined;
  showOwner: boolean;
}) {
  const navigate = useNavigate();
  const isPlatform = connection.scope === AppConnectionScope.PLATFORM;
  const isError = connection.status === AppConnectionStatus.ERROR;
  const userHasPermissionToRename = isPlatform
    ? userPlatformRole === PlatformRole.ADMIN
    : userHasPermissionToWriteAppConnection;
  const { variant, icon: Icon } = appConnectionUtils.getStatusIcon(
    connection.status,
  );
  const flowsCount = connection.flowIds?.length ?? 0;

  return (
    <div
      className={cn(
        'group ov-glass ov-glass-hover ov-slide-in-up relative flex flex-col rounded-2xl p-4',
        'hover:[&:not(:has(button:hover))]:[transform:translateY(-2px)]',
        isSelected &&
          'border-[#3B6EF5] ring-1 ring-[#3B6EF5]/40 hover:!border-[#3B6EF5]',
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      {/* Header: icon tile (top-left) + badges (top-right) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'absolute left-2.5 top-2.5 z-10 transition-opacity',
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              aria-label={t('Select connection')}
              className="bg-background/80 backdrop-blur"
            />
          </div>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/5 shadow-sm">
            <BlockIconWithBlockName
              blockName={connection.blockName}
              showTooltip={false}
              size="md"
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <span
              className="block truncate text-sm font-semibold text-foreground"
              title={connection.displayName}
            >
              {connection.displayName}
            </span>
            <p
              className="mt-0.5 truncate text-xs text-muted-foreground"
              title={connection.externalId}
            >
              {connection.externalId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isPlatform && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Globe className="size-3" />
                  {t('Global')}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {t(
                    'This connection is global and can be managed in the platform admin',
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <StatusIconWithText
            icon={Icon}
            text={formatUtils.convertEnumToHumanReadable(connection.status)}
            variant={variant}
          />
        </div>
      </div>

      {/* Inline re-auth affordance for the error state */}
      {isError && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{t('Re-authentication needed — use Reconnect to fix')}</span>
        </div>
      )}

      {/* Divider */}
      <div className="mt-4 border-t border-primary/10" />

      {/* Meta block */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" />
          {t('Connected')} <FormattedDate date={new Date(connection.updated)} />
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() =>
            navigate(
              `/build/automations?connectionExternalId=${connection.externalId}`,
            )
          }
        >
          <Workflow className="size-3.5 shrink-0" />
          {flowsCount} {t('flows')}
        </button>
      </div>

      {/* Footer: owner avatar + actions cluster */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-h-6 items-center">
          {showOwner && connection.ownerId ? (
            <IbAvatar
              id={connection.ownerId}
              includeAvatar={true}
              includeName={false}
              size="small"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {connection.scope === AppConnectionScope.PROJECT ? (
            <RenameConnectionDialog
              connectionId={connection.id}
              currentName={connection.displayName}
              onRename={onRefetch}
              userHasPermissionToRename={userHasPermissionToRename}
            />
          ) : (
            <EditGlobalConnectionDialog
              connectionId={connection.id}
              currentName={connection.displayName}
              projectIds={connection.projectIds}
              userHasPermissionToEdit={userHasPermissionToRename}
              onEdit={onRefetch}
              preSelectForNewProjects={
                connection.preSelectForNewProjects ?? false
              }
            />
          )}
          <ReconnectButtonDialog
            hasPermission={userHasPermissionToRename}
            connection={connection}
            onConnectionCreated={onRefetch}
          />
        </div>
      </div>
    </div>
  );
}
