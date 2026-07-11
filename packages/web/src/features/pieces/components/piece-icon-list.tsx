import {
  FlowTrigger,
  FlowActionType,
  flowStructureUtil,
  BlockCategory,
} from '@intelblocks/shared';
import { cva } from 'class-variance-authority';
import { t } from 'i18next';
import { useMemo } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { blocksHooks } from '../hooks/pieces-hooks';
import { StepMetadata } from '../types';
import { extractBlockNamesAndCoreMetadata } from '../utils/step-utils';

import { BlockIcon } from './piece-icon';

const extraIconVariants = cva(
  'flex items-center justify-center rounded-md bg-background border border-solid text-xs select-none',
  {
    variants: {
      size: {
        xxl: 'size-[64px]',
        xl: 'size-[48px]',
        lg: 'size-[40px]',
        md: 'size-[38px]',
        sm: 'size-[25px]',
        xs: 'size-[25px]',
      },
    },
  },
);

export function BlockIconList({
  maxNumberOfIconsToShow,
  trigger,
  size,
  className,
  background,
  excludeCore = false,
}: {
  trigger: FlowTrigger;
  maxNumberOfIconsToShow: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  background?: string;
  excludeCore?: boolean;
}) {
  const steps = flowStructureUtil.getAllSteps(trigger);

  const { blockNames, coreMetadata } = useMemo(
    () => extractBlockNamesAndCoreMetadata(steps, excludeCore),
    [steps, excludeCore],
  );

  const { summaries } = blocksHooks.useBlockSummariesByNames({
    names: blockNames,
  });

  const stepsMetadata: StepMetadata[] = useMemo(() => {
    const blockMetadata: StepMetadata[] = summaries
      .filter(
        (block) =>
          !excludeCore || !block.categories?.includes(BlockCategory.CORE),
      )
      .map((block) => ({
        displayName: block.displayName,
        logoUrl: block.logoUrl,
        description: block.description,
        type: FlowActionType.BLOCK as const,
        blockType: block.blockType,
        blockName: block.name,
        blockVersion: block.version,
        categories: block.categories ?? [],
        packageType: block.packageType,
        auth: block.auth,
      }));
    return [...coreMetadata, ...blockMetadata];
  }, [summaries, coreMetadata, excludeCore]);

  const uniqueMetadata: StepMetadata[] = stepsMetadata.filter(
    (item, index, self) =>
      self.findIndex(
        (secondItem) => item.displayName === secondItem.displayName,
      ) === index,
  );
  const visibleMetadata = uniqueMetadata.slice(0, maxNumberOfIconsToShow);
  const extraBlocks = uniqueMetadata.length - visibleMetadata.length;
  const extraMetadata = uniqueMetadata.slice(maxNumberOfIconsToShow);

  return (
    <div className={className || 'flex gap-0.5 '}>
      {visibleMetadata.map((metadata) => (
        <BlockIcon
          logoUrl={metadata.logoUrl}
          showTooltip={true}
          size={size ?? 'md'}
          border={true}
          displayName={metadata.displayName}
          key={metadata.displayName}
          background={background}
        />
      ))}
      {extraBlocks > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={extraIconVariants({ size: size ?? 'xs' })}>
              +{extraBlocks}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {extraMetadata.length > 1 &&
              extraMetadata
                .map((m) => m?.displayName || '')
                .slice(0, -1)
                .join(', ') +
                ` ${t('and')} ${
                  extraMetadata[extraMetadata.length - 1].displayName
                }`}
            {extraMetadata.length === 1 && extraMetadata[0].displayName}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
