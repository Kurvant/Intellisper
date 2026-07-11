import { Card, CardContent } from '@/components/ui/card';
import { BlockIconWithBlockName, blocksHooks } from '@/features/pieces';
import { formatUtils } from '@/lib/format-utils';

type BlockCardProps = {
  blockName: string;
};

export const BlockCard = ({ blockName }: BlockCardProps) => {
  const { summary } = blocksHooks.useBlockSummary({ name: blockName });

  return (
    <Card>
      <CardContent className="p-2 w-[165px] flex items-center gap-3">
        <BlockIconWithBlockName blockName={blockName} size="md" />
        <span className="text-sm font-medium">
          {summary?.displayName ||
            formatUtils.convertEnumToHumanReadable(blockName)}
        </span>
      </CardContent>
    </Card>
  );
};
