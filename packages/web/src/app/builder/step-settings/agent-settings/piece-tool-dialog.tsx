import { AgentTool, isNil, mcpToolNameUtils } from '@intelblocks/shared';
import { t } from 'i18next';
import { ChevronLeft } from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BlockActionsList,
  BlocksList,
  useBlockToolsDialogStore,
} from '@/features/agents';
import {
  stepsHooks,
  BlockStepMetadataWithSuggestions,
} from '@/features/pieces';

import { PredefinedInputsForm } from './predefined-inputs-form';

type AgentToolsDialogProps = {
  tools: AgentTool[];
  onToolsUpdate: (tools: AgentTool[]) => void;
};

const excludedBlocks = [
  '@intelblocks/block-ai',
  '@intelblocks/block-mcp',
  '@intelblocks/block-openai',
  '@intelblocks/block-claude',
  '@intelblocks/block-google-gemini',
  '@intelblocks/block-grok-xai',
];

export function AgentBlockDialog({
  tools,
  onToolsUpdate,
}: AgentToolsDialogProps) {
  const {
    showAddBlockDialog,
    selectedPage,
    searchQuery,
    selectedAction,
    isBlockAuthSet,
    selectedBlock,
    editingBlockTool,
    createNewBlockTool,
    goBackToActionsList,
    handleBlockSelect,
    handleActionSelect,
    goBackToBlocksList,
    closeBlockDialog,
  } = useBlockToolsDialogStore();

  const [debouncedQuery] = useDebounce(searchQuery, 300);

  const { metadata, isLoading: isBlocksLoading } =
    stepsHooks.useAllStepsMetadata({
      searchQuery: debouncedQuery,
      type: 'action',
    });

  const blockMetadata = useMemo(() => {
    return (
      metadata
        ?.filter(
          (m): m is BlockStepMetadataWithSuggestions =>
            'suggestedActions' in m && 'suggestedTriggers' in m,
        )
        .filter((block) => !excludedBlocks.includes(block.blockName)) ?? []
    );
  }, [metadata]);

  useEffect(() => {
    if (!showAddBlockDialog) return;
    if (!isNil(editingBlockTool) && blockMetadata.length > 0) {
      const block = blockMetadata.find(
        (p) => p.blockName === editingBlockTool.blockMetadata.blockName,
      );

      if (block) {
        handleBlockSelect(block);
        const action = block.suggestedActions?.find((a) => {
          return (
            mcpToolNameUtils.createBlockToolName(block.blockName, a.name) ===
            editingBlockTool.toolName
          );
        });
        if (action) {
          handleActionSelect(action);
        }
      }
    }
  }, [showAddBlockDialog, editingBlockTool, blockMetadata]);

  const authIsSetValue = isBlockAuthSet();

  const handleSave = () => {
    const newTool = createNewBlockTool();
    if (isNil(newTool)) return;

    if (!isNil(editingBlockTool)) {
      const updatedTools = tools.map((tool) =>
        tool.toolName === editingBlockTool.toolName ? newTool : tool,
      );
      onToolsUpdate(updatedTools);
      toast('Block tool updated');
    } else {
      onToolsUpdate([...tools, newTool]);
      toast('Block tool added');
    }

    closeBlockDialog();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      closeBlockDialog();
    }
  };

  const renderDialogMainContent = () => {
    switch (selectedPage) {
      case 'pieces-list': {
        return (
          <BlocksList
            isBlocksLoading={isBlocksLoading}
            blockMetadata={blockMetadata}
          />
        );
      }
      case 'actions-list': {
        return <BlockActionsList tools={tools} />;
      }
      case 'action-inputs': {
        return <PredefinedInputsForm />;
      }
    }
  };

  const renderDialogHeaderContent = () => {
    switch (selectedPage) {
      case 'pieces-list': {
        return t('Connect apps with the agent');
      }
      case 'actions-list': {
        return (
          selectedBlock && (
            <div className="flex items-center justify-start gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goBackToBlocksList}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Back')}</TooltipContent>
              </Tooltip>
              {t(selectedBlock.displayName)}
            </div>
          )
        );
      }
      case 'action-inputs': {
        return (
          selectedAction && (
            <div className="flex items-center justify-start gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goBackToActionsList}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Back')}</TooltipContent>
              </Tooltip>
              {selectedAction.displayName}
            </div>
          )
        );
      }
    }
  };

  return (
    <Dialog open={showAddBlockDialog} onOpenChange={handleDialogClose}>
      <DialogContent className="w-[90vw] max-w-[750px] h-[80vh] max-h-[800px] flex flex-col overflow-hidden p-0">
        <DialogHeader className="min-h-16 flex px-4 items-start justify-center mb-0 border-b">
          <DialogTitle>{renderDialogHeaderContent()}</DialogTitle>
        </DialogHeader>

        {renderDialogMainContent()}

        {selectedPage === 'action-inputs' && (
          <DialogFooter className="border-t p-4 mt-auto">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Close')}
              </Button>
            </DialogClose>
            <Button
              loading={false}
              disabled={!authIsSetValue}
              type="button"
              onClick={handleSave}
            >
              {editingBlockTool ? t('Update Tool') : t('Add Tool')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
