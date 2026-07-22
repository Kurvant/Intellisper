import { t } from 'i18next';
import {
  FolderPlus,
  Loader2,
  Sparkles,
  Table2,
  Upload,
  Workflow,
} from 'lucide-react';
import { ReactNode, useState } from 'react';

import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { useEmbedding } from '@/components/providers/embed-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Overhaul Create-New menu (all-new UI). Reproduces CreateNewMenu exactly (scopes, gates, busy
 * semantics). root scope: New Flow, Start from Template, New Table[!hideTables], New Folder
 * [!hideFolders]. folder scope: Import Flow[!hideExportImport] + Import Table[!hideTables].
 * Every item permission-gated + tooltip; menu can't close while busy.
 */
export function OvCreateMenu({
  children,
  scope = 'root',
  align = 'end',
  userHasPermissionToWriteFlow,
  userHasPermissionToWriteTable,
  userHasPermissionToWriteFolder,
  isCreatingFlow = false,
  isCreatingTable = false,
  onCreateFlow,
  onCreateTable,
  onCreateFolder,
  onImportFlow,
  onImportTable,
  onSelectTemplate,
  onOpenChange,
}: {
  children: ReactNode;
  scope?: 'root' | 'folder';
  align?: 'start' | 'end' | 'center';
  userHasPermissionToWriteFlow: boolean;
  userHasPermissionToWriteTable: boolean;
  userHasPermissionToWriteFolder: boolean;
  isCreatingFlow?: boolean;
  isCreatingTable?: boolean;
  onCreateFlow: () => void;
  onCreateTable: () => void;
  onCreateFolder?: () => void;
  onImportFlow: () => void;
  onImportTable: () => void;
  onSelectTemplate?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const { embedState } = useEmbedding();
  const [isOpen, setIsOpen] = useState(false);
  const busy = isCreatingFlow || isCreatingTable;
  const showFolder = scope === 'root' && !embedState.hideFolders;
  const showTemplate = scope === 'root';

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(next) => {
        if (busy && !next) return;
        setIsOpen(next);
        onOpenChange?.(next);
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {scope === 'root' && (
          <>
            <PermissionNeededTooltip
              hasPermission={userHasPermissionToWriteFlow}
            >
              <DropdownMenuItem
                disabled={!userHasPermissionToWriteFlow || busy}
                onSelect={(e) => {
                  e.preventDefault();
                  onCreateFlow();
                }}
              >
                {isCreatingFlow ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Workflow className="mr-2 h-4 w-4" />
                )}
                {isCreatingFlow ? t('Creating...') : t('New Flow')}
              </DropdownMenuItem>
            </PermissionNeededTooltip>

            {showTemplate && onSelectTemplate && (
              <PermissionNeededTooltip
                hasPermission={userHasPermissionToWriteFlow}
              >
                <DropdownMenuItem
                  disabled={!userHasPermissionToWriteFlow || busy}
                  onSelect={() => onSelectTemplate()}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('Start from Template')}
                </DropdownMenuItem>
              </PermissionNeededTooltip>
            )}

            {!embedState.hideTables && (
              <PermissionNeededTooltip
                hasPermission={userHasPermissionToWriteTable}
              >
                <DropdownMenuItem
                  disabled={!userHasPermissionToWriteTable || busy}
                  onSelect={(e) => {
                    e.preventDefault();
                    onCreateTable();
                  }}
                >
                  {isCreatingTable ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Table2 className="mr-2 h-4 w-4" />
                  )}
                  {isCreatingTable ? t('Creating...') : t('New Table')}
                </DropdownMenuItem>
              </PermissionNeededTooltip>
            )}

            {showFolder && onCreateFolder && (
              <>
                <DropdownMenuSeparator />
                <PermissionNeededTooltip
                  hasPermission={userHasPermissionToWriteFolder}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToWriteFolder || busy}
                    onClick={onCreateFolder}
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {t('New Folder')}
                  </DropdownMenuItem>
                </PermissionNeededTooltip>
              </>
            )}
          </>
        )}

        {scope === 'folder' &&
          (!embedState.hideExportAndImportFlow || !embedState.hideTables) && (
            <>
              {!embedState.hideExportAndImportFlow && (
                <PermissionNeededTooltip
                  hasPermission={userHasPermissionToWriteFlow}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToWriteFlow}
                    onClick={onImportFlow}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('Import Flow')}
                  </DropdownMenuItem>
                </PermissionNeededTooltip>
              )}
              {!embedState.hideTables && (
                <PermissionNeededTooltip
                  hasPermission={userHasPermissionToWriteTable}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToWriteTable}
                    onClick={onImportTable}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('Import Table')}
                  </DropdownMenuItem>
                </PermissionNeededTooltip>
              )}
            </>
          )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
