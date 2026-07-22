import Details from '@theme/Details';
import type {ReactNode} from 'react';
import styles from './Disclosure.module.css';

/**
 * Mintlify `<Accordion>` / `<AccordionGroup>` / `<Update>`.
 *
 * Accordion maps onto Docusaurus's own `<Details>` (already themed, keyboard-accessible, and
 * summary/expand behaviour handled) rather than a hand-rolled disclosure.
 *
 * `<Update>` is Mintlify's changelog entry (label + description + body). Docusaurus has no
 * equivalent, so it renders as a titled section — used by `about/changelog`.
 */

export function Accordion({
    title,
    defaultOpen = false,
    children,
}: {
    title?: ReactNode;
    defaultOpen?: boolean;
    children: ReactNode;
}): ReactNode {
    return (
        <Details summary={<summary>{title}</summary>} open={defaultOpen}>
            {children}
        </Details>
    );
}

// Mintlify groups accordions purely for spacing; there is no shared open/close state to model.
export function AccordionGroup({children}: {children: ReactNode}): ReactNode {
    return <div className={styles.accordionGroup}>{children}</div>;
}

export function Update({
    label,
    description,
    children,
}: {
    label?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
}): ReactNode {
    return (
        <div className={styles.update}>
            <div className={styles.updateHead}>
                {label ? <span className={styles.updateLabel}>{label}</span> : null}
                {description ? (
                    <span className={styles.updateDescription}>{description}</span>
                ) : null}
            </div>
            <div className={styles.updateBody}>{children}</div>
        </div>
    );
}
