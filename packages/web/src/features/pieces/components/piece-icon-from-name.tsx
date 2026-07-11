import { blocksHooks } from '../hooks/pieces-hooks';

import { BlockIcon } from './piece-icon';

type BlockIconWithBlockNameProps = {
  blockName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
  showTooltip?: boolean;
};

const BlockIconWithBlockName = ({
  blockName,
  size = 'md',
  border = true,
  showTooltip = true,
}: BlockIconWithBlockNameProps) => {
  const { summary } = blocksHooks.useBlockSummary({ name: blockName });

  return (
    <BlockIcon
      size={size}
      border={border}
      displayName={summary?.displayName}
      logoUrl={summary?.logoUrl}
      showTooltip={showTooltip}
    />
  );
};

export { BlockIconWithBlockName };
