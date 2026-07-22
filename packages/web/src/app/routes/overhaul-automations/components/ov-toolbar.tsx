import { BlockMetadataModelSummary } from '@intelblocks/blocks-framework';
import {
  AppConnectionWithoutSensitiveData,
  FlowStatus,
  FolderDto,
} from '@intelblocks/shared';
import { t } from 'i18next';
import {
  Download,
  Filter,
  Folder as FolderIcon,
  Link2,
  Plus,
  Search,
  Table2,
  ToggleLeft,
  User,
  Workflow,
  X,
} from 'lucide-react';

import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOwnerOptions } from '@/features/automations/hooks/use-owner-options';
import { formatUtils } from '@/lib/format-utils';

import { OvCreateMenu } from './ov-create-menu';
import { OvFilterOption, OvMultiSelect } from './ov-multi-select';

/**
 * Overhaul filters + toolbar bar (all-new UI). Reproduces AutomationsFilters exactly:
 * search (+clear), Type/Status/Connections/Owner[!embed]/Folder[if any] filters, Clear-all
 * [if active], Import dropdown[!hideExportImport: Import Flow, Import Table[!hideTables]], and the
 * Create-New menu. Every control's gate is preserved per the capability inventory.
 */
export function OvToolbar(props: OvToolbarProps) {
  const {
    searchTerm,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
    statusFilter,
    onStatusFilterChange,
    connectionFilter,
    onConnectionFilterChange,
    ownerFilter,
    onOwnerFilterChange,
    folderFilter,
    onFolderFilterChange,
    onFilterChange,
    folders,
    connections,
    blocks,
    userHasPermissionToWriteFlow,
    userHasPermissionToWriteTable,
    userHasPermissionToWriteFolder,
    onCreateFlow,
    onCreateTable,
    onCreateFolder,
    onImportFlow,
    onImportTable,
    onClearAllFilters,
    hasActiveFilters,
    isCreatingFlow,
    isCreatingTable,
    onSelectTemplate,
  } = props;

  const { embedState } = useEmbedding();
  const ownerOptions = useOwnerOptions();

  const typeOptions: OvFilterOption[] = [
    { value: 'flow', label: t('Flows') },
    ...(!embedState.hideTables ? [{ value: 'table', label: t('Tables') }] : []),
  ];
  const statusOptions: OvFilterOption[] = Object.values(FlowStatus).map(
    (status) => ({
      value: status,
      label: formatUtils.convertEnumToHumanReadable(status),
    }),
  );
  const connectionOptions: OvFilterOption[] = (connections ?? []).map((c) => {
    const logoUrl = blocks?.find((b) => b.name === c.blockName)?.logoUrl;
    return {
      value: c.externalId,
      label: c.displayName,
      icon: logoUrl ? (
        <img src={logoUrl} alt="" className="h-4 w-4 object-contain" />
      ) : undefined,
    };
  });
  const folderOptions: OvFilterOption[] = folders.map((f) => ({
    value: f.id,
    label: f.displayName,
  }));

  const withChange =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      onFilterChange?.();
    };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchTerm}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onFilterChange?.();
          }}
          placeholder={
            embedState.hideTables
              ? t('Search flows...')
              : t('Search flows and tables...')
          }
          className="h-9 w-[280px] max-w-xs rounded-lg border border-border bg-card pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              onFilterChange?.();
            }}
            aria-label={t('Clear search')}
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filters */}
      <OvMultiSelect
        label={t('Type')}
        icon={<Filter className="h-3.5 w-3.5" />}
        options={typeOptions}
        selectedValues={typeFilter}
        onChange={withChange(onTypeFilterChange)}
      />
      <OvMultiSelect
        label={t('Status')}
        icon={<ToggleLeft className="h-3.5 w-3.5" />}
        options={statusOptions}
        selectedValues={statusFilter}
        onChange={withChange(onStatusFilterChange)}
      />
      <OvMultiSelect
        label={t('Connections')}
        icon={<Link2 className="h-3.5 w-3.5" />}
        options={connectionOptions}
        selectedValues={connectionFilter}
        onChange={withChange(onConnectionFilterChange)}
        searchable
      />
      {!embedState.isEmbedded && (
        <OvMultiSelect
          label={t('Owner')}
          icon={<User className="h-3.5 w-3.5" />}
          options={ownerOptions}
          selectedValues={ownerFilter}
          onChange={withChange(onOwnerFilterChange)}
          searchable
        />
      )}
      {folderOptions.length > 0 && (
        <OvMultiSelect
          label={t('Folder')}
          icon={<FolderIcon className="h-3.5 w-3.5" />}
          options={folderOptions}
          selectedValues={folderFilter}
          onChange={withChange(onFolderFilterChange)}
          searchable
        />
      )}
      {hasActiveFilters && (
        <Button
          variant="link"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => {
            onClearAllFilters();
            onFilterChange?.();
          }}
        >
          <X className="h-3.5 w-3.5" />
          {t('Clear all')}
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!embedState.hideExportAndImportFlow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg"
              >
                <Download className="h-4 w-4" />
                {t('Import')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <PermissionNeededTooltip
                hasPermission={userHasPermissionToWriteFlow}
              >
                <DropdownMenuItem
                  disabled={!userHasPermissionToWriteFlow}
                  onClick={onImportFlow}
                >
                  <Workflow className="mr-2 h-4 w-4" />
                  {t('Import Flow')}
                </DropdownMenuItem>
              </PermissionNeededTooltip>
              {!embedState.hideTables && (
                <PermissionNeededTooltip
                  hasPermission={userHasPermissionToWriteTable}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToWriteTable}
                    onClick={onImportTable}
                  >
                    <Table2 className="mr-2 h-4 w-4" />
                    {t('Import Table')}
                  </DropdownMenuItem>
                </PermissionNeededTooltip>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <OvCreateMenu
          scope="root"
          align="end"
          userHasPermissionToWriteFlow={userHasPermissionToWriteFlow}
          userHasPermissionToWriteTable={userHasPermissionToWriteTable}
          userHasPermissionToWriteFolder={userHasPermissionToWriteFolder}
          isCreatingFlow={isCreatingFlow}
          isCreatingTable={isCreatingTable}
          onCreateFlow={onCreateFlow}
          onCreateTable={onCreateTable}
          onCreateFolder={onCreateFolder}
          onImportFlow={onImportFlow}
          onImportTable={onImportTable}
          onSelectTemplate={onSelectTemplate}
        >
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('Create New')}
          </Button>
        </OvCreateMenu>
      </div>
    </div>
  );
}

type OvToolbarProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  typeFilter: string[];
  onTypeFilterChange: (value: string[]) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  connectionFilter: string[];
  onConnectionFilterChange: (value: string[]) => void;
  ownerFilter: string[];
  onOwnerFilterChange: (value: string[]) => void;
  folderFilter: string[];
  onFolderFilterChange: (value: string[]) => void;
  onFilterChange?: () => void;
  folders: FolderDto[];
  connections: AppConnectionWithoutSensitiveData[] | undefined;
  blocks: BlockMetadataModelSummary[] | undefined;
  userHasPermissionToWriteFlow: boolean;
  userHasPermissionToWriteTable: boolean;
  userHasPermissionToWriteFolder: boolean;
  onCreateFlow: () => void;
  onCreateTable: () => void;
  onCreateFolder: () => void;
  onImportFlow: () => void;
  onImportTable: () => void;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
  isCreatingFlow?: boolean;
  isCreatingTable?: boolean;
  onSelectTemplate?: () => void;
};
