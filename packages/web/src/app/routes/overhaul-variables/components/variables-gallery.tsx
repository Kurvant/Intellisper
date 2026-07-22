import { Permission, VariableWithoutSensitiveData } from '@intelblocks/shared';
import { t } from 'i18next';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  User,
  Variable,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { VariableDialog } from '@/app/variables/variable-dialog';
import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { PlusIcon } from '@/components/icons/plus';
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
  variablesMutations,
  variablesQueries,
} from '@/features/variables/hooks/variables-hooks';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import {
  OvFilterOption,
  OvMultiSelect,
} from '../../overhaul-automations/components/ov-multi-select';

import { OvVariableCard } from './ov-variable-card';

const PAGE_SIZE_OPTIONS = [10, 30, 50];

const copyReferenceToClipboard = async (name: string) => {
  try {
    await navigator.clipboard.writeText(`{{variables['${name}']}}`);
    toast.success(t('Reference copied to clipboard'));
  } catch {
    toast.error(t('Could not copy reference'));
  }
};

/**
 * Card-gallery presentation of the Variables page — a different layout/feel from the table with the
 * SAME capabilities: name search + owner filter (URL-param driven, identical to the table view),
 * cursor pagination + page size, per-card Edit/Copy-reference/Delete (permission-gated), multi-select
 * + bulk delete, New variable, create/edit dialog, empty + no-results states. All logic is the same
 * reusable hooks the table uses, so the two views stay in sync.
 */
export function VariablesGallery() {
  const projectId = authenticationSession.getProjectId()!;
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_VARIABLE);
  const { embedState } = useEmbedding();
  const showOwner = !embedState.isEmbedded;

  const [, setSearchParams] = useSearchParams();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<
    VariableWithoutSensitiveData | undefined
  >(undefined);
  const [deleting, setDeleting] = useState<
    VariableWithoutSensitiveData | undefined
  >(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { cursor, limit, name, ownerEmails } =
    variablesQueries.useListSearchParams();

  const {
    data: variables,
    isLoading,
    refetch,
  } = variablesQueries.useVariables({
    request: { projectId, cursor, limit, name },
    extraKeys: [
      'variables',
      cursor ?? '',
      String(limit),
      name ?? '',
      projectId,
    ],
    showErrorDialog: true,
  });

  const { mutateAsync: deleteVariable } =
    variablesMutations.useBulkDeleteVariables(refetch);
  const { data: owners } = variablesQueries.useVariableOwners(projectId);

  const rows = useMemo(() => {
    if (!variables?.data) return [];
    if (ownerEmails.length === 0) return variables.data;
    return variables.data.filter(
      (v) => v.owner && ownerEmails.includes(v.owner.email),
    );
  }, [variables, ownerEmails]);

  const ownerOptions: OvFilterOption[] = (owners ?? []).map((owner) => ({
    label: `${owner.firstName} ${owner.lastName}`,
    value: owner.email,
  }));

  const updateParams = (mutate: (p: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        // Any filter change resets the cursor to the first page.
        next.delete(CURSOR_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
    setSelectedIds(new Set());
  };

  const setName = (value: string) =>
    updateParams((p) => {
      if (value) p.set('name', value);
      else p.delete('name');
    });

  const setOwners = (values: string[]) =>
    updateParams((p) => {
      p.delete('owner');
      values.forEach((v) => p.append('owner', v));
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

  const filtersActive = Boolean(name) || ownerEmails.length > 0;
  const clearFilters = () =>
    updateParams((p) => {
      p.delete('name');
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
            value={name ?? ''}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Search variables...')}
            className="h-9 w-[260px] max-w-xs rounded-lg border border-border bg-card pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {name && (
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

        {showOwner && (
          <OvMultiSelect
            label={t('Owner')}
            icon={<User className="h-3.5 w-3.5" />}
            options={ownerOptions}
            selectedValues={ownerEmails}
            onChange={setOwners}
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
          <PermissionNeededTooltip hasPermission={canWrite}>
            <Button
              disabled={!canWrite}
              size="sm"
              className="h-9 gap-1.5 rounded-lg"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon size={16} />
              {t('New variable')}
            </Button>
          </PermissionNeededTooltip>
        </div>
      </div>

      {/* Grid / states */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-xl border border-border/70 bg-muted/40"
            />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Variable className="size-12 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">{t('No variables yet')}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t('Create one to reference a value from any step input.')}
          </p>
          <PermissionNeededTooltip hasPermission={canWrite}>
            <Button
              disabled={!canWrite}
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon size={16} />
              {t('New variable')}
            </Button>
          </PermissionNeededTooltip>
        </div>
      ) : isNoResults ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Search className="size-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">
            {t('No variables match your filters')}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((variable) => (
            <OvVariableCard
              key={variable.id}
              variable={variable}
              isSelected={selectedIds.has(variable.id)}
              onToggleSelect={() => toggleSelect(variable.id)}
              onEdit={() => setEditing(variable)}
              onCopyReference={() =>
                void copyReferenceToClipboard(variable.name)
              }
              onDelete={() => setDeleting(variable)}
              canWrite={canWrite}
              showOwner={showOwner}
            />
          ))}
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
              disabled={!variables?.previous}
              onClick={() => goToCursor(variables?.previous)}
            >
              <ChevronLeft className="mr-1 size-4" />
              {t('Previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!variables?.next}
              onClick={() => goToCursor(variables?.next)}
            >
              {t('Next')}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">
            {t('{count} selected', { count: selectedIds.size })}
          </span>
          <ConfirmationDeleteDialog
            title={t('Delete variables')}
            message={t(
              'This permanently deletes the selected variables. Flows that reference them will fail at runtime.',
            )}
            entityName={t('variable')}
            buttonText={t('Delete')}
            isDanger
            showToast
            open={showBulkDeleteDialog}
            onOpenChange={setShowBulkDeleteDialog}
            mutationFn={async () => {
              await deleteVariable(Array.from(selectedIds));
              setSelectedIds(new Set());
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={!canWrite}
              onClick={() => setShowBulkDeleteDialog(true)}
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

      {/* Dialogs */}
      <VariableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => refetch()}
      />
      <VariableDialog
        open={!!editing}
        existing={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        onSaved={() => {
          refetch();
          setEditing(undefined);
        }}
      />
      <ConfirmationDeleteDialog
        title={t('Delete variable')}
        message={t(
          'This permanently deletes the variable. Flows that reference it will fail at runtime.',
        )}
        entityName={deleting?.name ?? ''}
        isDanger
        showToast
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        mutationFn={async () => {
          if (!deleting) return;
          await deleteVariable([deleting.id]);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}
