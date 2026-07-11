import { IbEdition, IbFlagId } from '@intelblocks/shared';

import { flagsHooks } from '@/hooks/flags-hooks';

type EditionGuardProps = {
  children: React.ReactNode;
  allowedEditions: IbEdition[];
};

const EditionGuard = ({ children, allowedEditions }: EditionGuardProps) => {
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);

  if (!edition || !allowedEditions.includes(edition)) {
    return null;
  }
  return children;
};

EditionGuard.displayName = 'EditionGuard';
export { EditionGuard };
