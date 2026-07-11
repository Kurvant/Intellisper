import { IbFlagId } from '@intelblocks/shared';

import { flagsHooks } from '@/hooks/flags-hooks';

type FlagGuardProps = {
  children: React.ReactNode;
  flag: IbFlagId;
};
const FlagGuard = ({ children, flag }: FlagGuardProps) => {
  const { data: flagValue } = flagsHooks.useFlag<boolean>(flag);
  if (!flagValue) {
    return null;
  }
  return children;
};

FlagGuard.displayName = 'FlagGuard';
export { FlagGuard };
