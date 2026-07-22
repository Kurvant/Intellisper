import { AppConnectionStatus, Permission } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
  Replace as ReplaceIcon,
  Search,
  Trash2,
  ToggleLeft,
  User,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { NewConnectionDialog } from '@/app/connections/new-connection-dialog';
import { ReplaceConnectionsDialog } from '@/app/connections/replace-connections-dialog';
import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { DeleteConnectionWarning } from '@/components/custom/global-connection-utils';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  appConnectionsMutations,
  appConnectionsQueries,
} from '@/features/connections';
import { blocksHooks } from '@/features/pieces';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import {
  OvFilterOption,
  OvMultiSelect,
} from '../../overhaul-automations/components/ov-multi-select';

import { OvConnectionCard } from './ov-connection-card';

const PAGE_SIZE_OPTIONS = [10, 30, 50];

/**
 * Card-gallery presentation of Connections — a different layout/feel from the table with the SAME
 * capabilities: status/block/name/owner filters (URL-param driven, identical to the table view),
 * cursor pagination + page size, multi-select + bulk delete, New + Replace connection, per-card
 * rename / edit-global / reconnect (reusing the exact same dialogs + gates), Globe badge, status,
 * Flows link, owner. Reuses the same connections hooks the table uses.
 */
export function ConnectionsGallery() {
  const projectId = authenticationSession.getProjectId()!;
  const { checkAccess } = useAuthorization();
  const userHasPermissionToWriteAppConnection = checkAccess(
    Permission.WRITE_APP_CONNECTION,
  );
  const userPlatformRole = userHooks.getCurrentUserPlatformRole();
  const { embedState } = useEmbedding();
  const showOwner = !embedState.isEmbedded;

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const cursor = searchParams.get(CURSOR_QUERY_PARAM) ?? undefined;
  const limit = searchParams.get(LIMIT_QUERY_PARAM)
    ? parseInt(searchParams.get(LIMIT_QUERY_PARAM)!)
    : 10;
  const status = searchParams.getAll('status') as AppConnectionStatus[];
  const blockName = searchParams.get('blockName') ?? undefined;
  const displayName = searchParams.get('displayName') ?? undefined;
  const ownerEmails = searchParams.getAll('owner');

  const {
    data: connections,
    isLoading,
    refetch,
  } = appConnectionsQueries.useAppConnections({
    request: { projectId, cursor, limit, status, blockName, displayName },
    extraKeys: [searchParams.toString(), projectId],
    showErrorDialog: true,
  });

  const { mutateAsync: deleteConnections } =
    appConnectionsMutations.useBulkDeleteAppConnections(refetch);
  const { data: owners } = appConnectionsQueries.useConnectionsOwners();
  const { blocks } = blocksHooks.useBlocks({});

  const rows = useMemo(() => {
    if (!connections?.data) return [];
    if (ownerEmails.length === 0) return connections.data;
    return connections.data.filter(
      (c) => c.owner && ownerEmails.includes(c.owner.email),
    );
  }, [connections, ownerEmails]);

  const statusOptions: OvFilterOption[] = Object.values(
    AppConnectionStatus,
  ).map((s) => ({
    value: s,
    label: formatUtils.convertEnumToHumanReadable(s),
  }));
  const blockOptions: OvFilterOption[] = (blocks ?? []).map((b) => ({
    value: b.name,
    label: b.displayName,
  }));
  const ownerOptions: OvFilterOption[] = (owners ?? []).map((o) => ({
    value: o.email,
    label: `${o.firstName} ${o.lastName}`,
  }));

  const updateParams = (mutate: (p: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        next.delete(CURSOR_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
    setSelectedIds(new Set());
  };

  const setMultiParam = (key: string, values: string[]) =>
    updateParams((p) => {
      p.delete(key);
      values.forEach((v) => p.append(key, v));
    });
  const setName = (value: string) =>
    updateParams((p) => {
      if (value) p.set('displayName', value);
      else p.delete('displayName');
    });
  const setPageSize = (size: number) =>
    updateParams((p) => p.set(LIMIT_QUERY_PARAM, String(size)));

  const goToCursor = (nextCursor: string | null | undefined) => {
    if (!nextCursor) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(CURSOR_QUERY_PARAM, nextCursor);
        return next;
      },
      { replace: true },
    );
    setSelectedIds(new Set());
  };

  const filtersActive =
    status.length > 0 || !!blockName || !!displayName || ownerEmails.length > 0;
  const clearFilters = () =>
    updateParams((p) => {
      p.delete('status');
      p.delete('blockName');
      p.delete('displayName');
      p.delete('owner');
    });

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const isEmpty = !isLoading && rows.length === 0 && !filtersActive;
  const isNoResults = !isLoading && rows.length === 0 && filtersActive;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={displayName ?? ''}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Search connections...')}
            className="h-9 w-[240px] max-w-xs rounded-lg border border-border bg-card pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {displayName && (
            <button
              type="button"
              onClick={() => setName('')}
              aria-label={t('Clear search')}
              className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <OvMultiSelect
          label={t('Status')}
          icon={<ToggleLeft className="h-3.5 w-3.5" />}
          options={statusOptions}
          selectedValues={status}
          onChange={(v) => setMultiParam('status', v)}
        />
        <OvMultiSelect
          label={t('Blocks')}
          icon={<Link2 className="h-3.5 w-3.5" />}
          options={blockOptions}
          selectedValues={blockName ? [blockName] : []}
          onChange={(v) => setMultiParam('blockName', v.slice(-1))}
          searchable
        />
        {showOwner && (
          <OvMultiSelect
            label={t('Owner')}
            icon={<User className="h-3.5 w-3.5" />}
            options={ownerOptions}
            selectedValues={ownerEmails}
            onChange={(v) => setMultiParam('owner', v)}
            searchable
          />
        )}
        {filtersActive && (
          <Button
            variant="link"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            {t('Clear all')}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {rows.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                aria-label={t('Select all')}
              />
              {t('Select all')}
            </label>
          )}
          <PermissionNeededTooltip
            hasPermission={userHasPermissionToWriteAppConnection}
          >
            <ReplaceConnectionsDialog
              projectId={projectId}
              onConnectionMerged={() => refetch()}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg"
                disabled={!userHasPermissionToWriteAppConnection}
              >
                <ReplaceIcon className="size-4" />
                {t('Replace')}
              </Button>
            </ReplaceConnectionsDialog>
          </PermissionNeededTooltip>
          <PermissionNeededTooltip
            hasPermission={userHasPermissionToWriteAppConnection}
          >
            <NewConnectionDialog
              isGlobalConnection={false}
              onConnectionCreated={() => refetch()}
            >
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-lg"
                disabled={!userHasPermissionToWriteAppConnection}
              >
                <Plus className="size-4" />
                {t('New Connection')}
              </Button>
            </NewConnectionDialog>
          </PermissionNeededTooltip>
        </div>
      </div>

      {/* Grid / states */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="ov-glass ov-slide-in-up h-[190px] animate-pulse rounded-2xl"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="ov-glass ov-slide-in-up flex flex-col items-center justify-center rounded-2xl py-16 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-primary/15 bg-primary/5">
            <Link2 className="size-7 text-primary/70" />
          </div>
          <p className="mt-4 text-sm font-medium">
            {t('No connections found')}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t(
              'Come back later when you create a automation to manage your connections',
            )}
          </p>
        </div>
      ) : isNoResults ? (
        <div className="ov-glass ov-slide-in-up flex flex-col items-center justify-center rounded-2xl py-16 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-primary/15 bg-primary/5">
            <Search className="size-7 text-primary/70" />
          </div>
          <p className="mt-4 text-sm font-medium">
            {t('No connections match your filters')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={clearFilters}
          >
            {t('Clear filters')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((connection, i) => (
            <OvConnectionCard
              key={connection.id}
              connection={connection}
              index={i}
              isSelected={selectedIds.has(connection.id)}
              onToggleSelect={() => toggleSelect(connection.id)}
              onRefetch={() => refetch()}
              userHasPermissionToWriteAppConnection={
                userHasPermissionToWriteAppConnection
              }
              userPlatformRole={userPlatformRole}
              showOwner={showOwner}
            />
          ))}

          {/* Dashed "Add Connection" card slot — triggers the same New Connection dialog */}
          <PermissionNeededTooltip
            hasPermission={userHasPermissionToWriteAppConnection}
          >
            <NewConnectionDialog
              isGlobalConnection={false}
              onConnectionCreated={() => refetch()}
            >
              <button
                type="button"
                disabled={!userHasPermissionToWriteAppConnection}
                className="ov-slide-in-up group flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.02] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-primary/25 disabled:hover:bg-primary/[0.02] disabled:hover:text-muted-foreground"
                style={{
                  animationDelay: `${Math.min(rows.length, 12) * 40}ms`,
                }}
              >
                <span className="grid size-11 place-items-center rounded-xl border border-primary/20 bg-primary/5 text-primary transition-transform group-hover:scale-105">
                  <Plus className="size-5" />
                </span>
                <span className="text-sm font-medium">
                  {t('New Connection')}
                </span>
              </button>
            </NewConnectionDialog>
          </PermissionNeededTooltip>
        </div>
      )}

      {/* Cursor pagination */}
      {!isEmpty && !isNoResults && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('Rows per page')}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!connections?.previous}
              onClick={() => goToCursor(connections?.previous)}
            >
              <ChevronLeft className="mr-1 size-4" />
              {t('Previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!connections?.next}
              onClick={() => goToCursor(connections?.next)}
            >
              {t('Next')}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="ov-glass ov-slide-in-up fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">
            {t('{count} selected', { count: selectedIds.size })}
          </span>
          <ConfirmationDeleteDialog
            title={t('Delete Connections')}
            message={t('The selected connections will be permanently deleted.')}
            warning={<DeleteConnectionWarning />}
            entityName={t('connection')}
            buttonText={t('Delete')}
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            showToast
            mutationFn={async () => {
              await deleteConnections(Array.from(selectedIds));
              refetch();
              setSelectedIds(new Set());
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-1 size-4" />
              {t('Delete')} ({selectedIds.size})
            </Button>
          </ConfirmationDeleteDialog>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            {t('Clear')}
          </Button>
        </div>
      )}
    </div>
  );
}
