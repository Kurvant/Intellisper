import Admonition from '@theme/Admonition';
import type {ReactNode} from 'react';

/**
 * Mintlify callout components, mapped onto Docusaurus admonitions.
 *
 * WHY SHIMS instead of rewriting the MDX: the ported pages use these tags ~144 times. Re-authoring
 * every one into `:::note` syntax would be a large, error-prone diff across 219 files for no reader
 * benefit. Keeping the tag names means the content ports unchanged and stays diffable against the
 * legacy `docs/` tree during the migration.
 *
 * Severity mapping follows the Mintlify writing rule in `.agents/rules/mintlify.md`:
 *   Note -> note | Tip -> tip | Warning -> warning | Info -> info | Check -> tip (success)
 */

type CalloutProps = {
    children: ReactNode;
};

export function Note({children}: CalloutProps): ReactNode {
    return <Admonition type="note">{children}</Admonition>;
}

export function Tip({children}: CalloutProps): ReactNode {
    return <Admonition type="tip">{children}</Admonition>;
}

export function Warning({children}: CalloutProps): ReactNode {
    return <Admonition type="warning">{children}</Admonition>;
}

export function Info({children}: CalloutProps): ReactNode {
    return <Admonition type="info">{children}</Admonition>;
}

// Mintlify's success/confirmation callout. Docusaurus has no `success` type; `tip` is its
// positive-affirmation equivalent and renders green.
export function Check({children}: CalloutProps): ReactNode {
    return <Admonition type="tip">{children}</Admonition>;
}
