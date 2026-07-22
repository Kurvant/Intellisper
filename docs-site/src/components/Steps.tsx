import type {ReactNode} from 'react';
import styles from './Steps.module.css';

/**
 * Mintlify `<Steps>` / `<Step title="…">` — numbered procedures. The heaviest-used pair in the
 * ported content (~168 usages), so it is shimmed rather than rewritten.
 *
 * Docusaurus has no built-in stepper. This renders an ordered list with a numbered rail; the count
 * comes from CSS counters, so steps stay correctly numbered no matter how the MDX nests them (and
 * without React needing to inspect its children).
 */

export function Steps({children}: {children: ReactNode}): ReactNode {
    return <div className={styles.steps}>{children}</div>;
}

export function Step({
    title,
    children,
}: {
    title?: ReactNode;
    children: ReactNode;
}): ReactNode {
    return (
        <div className={styles.step}>
            {title ? <div className={styles.stepTitle}>{title}</div> : null}
            <div className={styles.stepBody}>{children}</div>
        </div>
    );
}
