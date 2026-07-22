import MDXComponents from '@theme-original/MDXComponents';
import {Card, CardGroup, Columns} from '@site/src/components/Cards';
import {Check, Info, Note, Tip, Warning} from '@site/src/components/Callouts';
import {Accordion, AccordionGroup, Update} from '@site/src/components/Disclosure';
import {Step, Steps} from '@site/src/components/Steps';

/**
 * Register the Mintlify-compatible shims GLOBALLY, so the ~219 ported pages use them with no
 * per-file imports — exactly as they did under Mintlify. This is what lets M3 port content
 * essentially unchanged and keeps it diffable against the legacy `docs/` tree.
 *
 * Scope is measured, not guessed: these are the ONLY Mintlify components the published pages
 * actually use (Step 135, Tip 74, Warning 38, Steps 33, Card 26, Accordion 16, Note 14, Info 14,
 * CardGroup 7, Update 6, AccordionGroup 4). `Frame`, `ParamField`, `ResponseField`, `Tabs`,
 * `Expandable` and `Tooltip` do NOT appear in the published set and are deliberately not shimmed —
 * an unused component is a thing to maintain and mislead, not an asset.
 *
 * `<Snippet file="…" />` is NOT shimmed: it resolves a file path at build time, which MDX cannot do
 * from a runtime prop. Its 3 files become real MDX partials under `docs/_partials/` and M3 rewrites
 * the 21 call sites into imports — the native Docusaurus mechanism.
 */
export default {
    ...MDXComponents,
    // Callouts -> admonitions
    Note,
    Tip,
    Warning,
    Info,
    Check,
    // Procedures
    Steps,
    Step,
    // Navigation tiles
    Card,
    CardGroup,
    Columns,
    // Disclosure + changelog
    Accordion,
    AccordionGroup,
    Update,
};
