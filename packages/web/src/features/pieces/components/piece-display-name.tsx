import { blocksHooks } from '../hooks/pieces-hooks';

type BlockDisplayNameProps = {
  blockName: string;
  fallback?: string;
};

const BlockDisplayName = ({ blockName, fallback }: BlockDisplayNameProps) => {
  const { summary } = blocksHooks.useBlockSummary({ name: blockName });

  return <span>{summary?.displayName || fallback || blockName}</span>;
};

export { BlockDisplayName };
