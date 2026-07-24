import {
  Permission,
  SeekPage,
  Table,
  UncategorizedFolderId,
} from '@intelblocks/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  ArrowRight,
  FolderOpen,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { foldersHooks } from '@/features/folders';
import { ImportTableDialog } from '@/features/tables';
import { tablesApi } from '@/features/tables/api/tables-api';
import {
  tableHooks,
  tableMutations,
} from '@/features/tables/hooks/table-hooks';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import { NewAppShell } from '../../components/overhaul/new-app-shell';

/**
 * Tables list — the Data domain's landing page in the new shell (there was previously no
 * standalone tables list; the nav item pointed at Automations). "Ledger card" design: every
 * table renders as a card whose top is a miniature faux data-grid (deterministic per table id),
 * so the page reads as a shelf of living spreadsheets rather than a generic list.
 *
 * Links out: card → /data/tables/:tableId (new-shell editor) · New table → editor with
 * ?newTable=true · Import → ImportTableDialog (same one Automations uses) · empty state →
 * /build/explore (templates) and /build/automations (tables also appear in the gallery).
 * All data interactions reuse existing hooks/APIs (tablesApi, tableHooks, tableMutations) —
 * nothing new on the wire.
 */

// Deterministic pseudo-random widths (percent) for the faux grid rows, seeded by table id so
// every card looks subtly different but stable across renders.
function previewWidths(id: string): number[][] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const w = (n: number) => 35 + ((h >> (n * 3)) % 50);
  return [
    [w(1), w(2), w(3)],
    [w(4), w(5), w(6)],
    [w(7), w(8), w(9)],
  ];
}

function TableCardPreview({ tableId }: { tableId: string }) {
  const rows = previewWidths(tableId);
  return (
    <div className="pointer-events-none rounded-t-xl border-b border-border/60 bg-muted/40 px-4 pb-3 pt-4">
      {/* header strip */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((c) => (
          <div key={c} className="h-1.5 rounded-full bg-primary/25" />
        ))}
      </div>
      {/* data rows */}
      {rows.map((cols, r) => (
        <div key={r} className="mb-1.5 grid grid-cols-3 gap-2 last:mb-0">
          {cols.map((width, c) => (
            <div key={c} className="h-1.5 rounded-full bg-foreground/[0.08]">
              <div
                className="h-full rounded-full bg-foreground/[0.06]"
                style={{ width: `${width}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RenameTableDialog({
  table,
  open,
  onOpenChange,
}: {
  table: Table;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(table.name);
  const queryClient = useQueryClient();
  const { mutate: rename, isPending } = tableMutations.useRenameTable({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Rename Table')}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('Table name')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={name.trim().length === 0 || isPending}
            loading={isPending}
            onClick={() => rename({ tableId: table.id, name: name.trim() })}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TableCard({
  table,
  folderName,
  canWrite,
  onOpen,
  onDeleted,
}: {
  table: Table;
  folderName: string | null;
  canWrite: boolean;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className="group relative cursor-pointer rounded-xl border bg-background text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_36px_-14px_rgba(31,41,51,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <TableCardPreview tableId={table.id} />

      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Table2 className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight text-foreground">
            {table.name}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            {folderName && (
              <span className="inline-flex max-w-[130px] items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5">
                <FolderOpen className="size-3 flex-shrink-0" />
                <span className="truncate">{folderName}</span>
              </span>
            )}
            <span>
              {t('Updated')} {formatUtils.formatDate(new Date(table.updated))}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {canWrite && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil className="mr-2 size-4" />
                  {t('Rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  {t('Delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
      </div>

      {renameOpen && (
        <RenameTableDialog
          table={table}
          open={renameOpen}
          onOpenChange={setRenameOpen}
        />
      )}
      <ConfirmationDeleteDialog
        title={t('Delete Table')}
        message={t(
          'Are you sure you want to delete "{name}"? All its records will be permanently removed.',
          { name: table.name },
        )}
        entityName={table.name}
        showToast={true}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        mutationFn={async () => {
          await tablesApi.delete(table.id);
          onDeleted();
        }}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-background shadow-sm">
      <div className="rounded-t-xl border-b border-border/60 bg-muted/40 px-4 pb-3 pt-4">
        <Skeleton className="mb-2 h-1.5 w-full" />
        <Skeleton className="mb-1.5 h-1.5 w-4/5" />
        <Skeleton className="h-1.5 w-3/5" />
      </div>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="mb-1.5 h-3.5 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}

export function OverhaulTablesListPage() {
  const navigate = useNavigate();
  const projectId = authenticationSession.getProjectId() ?? '';
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_TABLE);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const { folders } = foldersHooks.useFolders();

  const { data, isLoading } = useQuery<SeekPage<Table>>({
    queryKey: ['tables', 'overhaul-list', projectId, limit],
    queryFn: () => tablesApi.list({ projectId, limit }),
  });

  const { mutate: createTable, isPending: isCreating } =
    tableHooks.useCreateTable(UncategorizedFolderId, 'overhaul');

  const tables = useMemo(() => {
    const all = data?.data ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((tb) => tb.name.toLowerCase().includes(q)) : all;
  }, [data, search]);

  const folderName = (folderId: string | null | undefined): string | null => {
    if (!folderId) return null;
    return folders?.find((f) => f.id === folderId)?.displayName ?? null;
  };

  const openTable = (tableId: string) =>
    navigate(
      authenticationSession.appendProjectRoutePrefix(`/data/tables/${tableId}`),
    );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['tables'] });

  const isEmpty = !isLoading && (data?.data ?? []).length === 0;

  return (
    <NewAppShell
      title={t('Tables')}
      subtitle={t('Structured data your automations read and write')}
      actions={
        <>
          <PermissionNeededTooltip hasPermission={canWrite}>
            <Button
              variant="outline"
              disabled={!canWrite}
              onClick={() => setImportOpen(true)}
              className="gap-2"
            >
              <Upload className="size-4" />
              {t('Import')}
            </Button>
          </PermissionNeededTooltip>
          <PermissionNeededTooltip hasPermission={canWrite}>
            <Button
              disabled={!canWrite || isCreating}
              loading={isCreating}
              onClick={() => createTable({ name: t('New Table') })}
              className="gap-2"
            >
              <Plus className="size-4" />
              {t('New table')}
            </Button>
          </PermissionNeededTooltip>
        </>
      }
    >
      <div className="mx-auto max-w-[1280px] px-7 py-5">
        {/* Toolbar */}
        {!isEmpty && (
          <div className="mb-5 flex items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search tables')}
                className="pl-8"
              />
            </div>
            {!isLoading && (
              <span className="text-[12.5px] text-muted-foreground">
                {t('{count} tables', { count: tables.length })}
              </span>
            )}
            <Link
              to="/build/automations"
              className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <Workflow className="size-3.5" />
              {t('View alongside flows in Automations')}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-8 py-20 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Table2 className="size-7" />
            </div>
            <h2 className="text-lg font-semibold">{t('No tables yet')}</h2>
            <p className="mt-1.5 max-w-md text-[13.5px] text-muted-foreground">
              {t(
                'Tables hold the structured data your flows and agents read and write — leads, orders, scores, anything.',
              )}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <PermissionNeededTooltip hasPermission={canWrite}>
                <Button
                  disabled={!canWrite || isCreating}
                  loading={isCreating}
                  onClick={() => createTable({ name: t('New Table') })}
                  className="gap-2"
                >
                  <Plus className="size-4" />
                  {t('Create your first table')}
                </Button>
              </PermissionNeededTooltip>
              <Button
                variant="outline"
                onClick={() => navigate('/build/explore')}
              >
                {t('Browse templates')}
              </Button>
            </div>
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-8 py-16 text-center text-[13.5px] text-muted-foreground">
            {t('No tables match "{search}"', { search })}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  folderName={folderName(table.folderId)}
                  canWrite={canWrite}
                  onOpen={() => openTable(table.id)}
                  onDeleted={invalidate}
                />
              ))}
            </div>
            {data?.next && !search && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setLimit((l) => l + 50)}
                >
                  {t('Load more')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ImportTableDialog
        open={importOpen}
        setIsOpen={setImportOpen}
        showTrigger={false}
        variant="overhaul"
        onImportSuccess={invalidate}
      />
    </NewAppShell>
  );
}

export default OverhaulTablesListPage;
