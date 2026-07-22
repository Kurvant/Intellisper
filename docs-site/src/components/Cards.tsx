import Link from '@docusaurus/Link';
import clsx from 'clsx';
import type {ReactNode} from 'react';
import styles from './Cards.module.css';

/**
 * Mintlify `<Card>` / `<CardGroup>` — the linked navigation tiles used on landing pages.
 *
 * Props supported are the ones the ported content actually uses (measured across the .mdx):
 * `title`, `icon`, `color`, `href`. `icon` is Mintlify's Font Awesome name (e.g. "docker",
 * "layer-group"); we do not ship Font Awesome, so it is accepted and IGNORED rather than rendered
 * wrong — M5 maps the meaningful ones onto the real icon set. Dropping the prop instead would mean
 * editing every call site for no reader benefit.
 */

type CardProps = {
    title?: ReactNode;
    icon?: string;
    color?: string;
    href?: string;
    children?: ReactNode;
};

export function Card({title, color, href, children}: CardProps): ReactNode {
    const body = (
        <>
            {title ? (
                <div className={styles.cardTitle} style={color ? {borderTopColor: color} : undefined}>
                    {title}
                </div>
            ) : null}
            {children ? <div className={styles.cardBody}>{children}</div> : null}
        </>
    );

    if (href) {
        return (
            <Link to={href} className={clsx(styles.card, styles.cardLink)}>
                {body}
            </Link>
        );
    }
    return <div className={styles.card}>{body}</div>;
}

export function CardGroup({
    cols = 2,
    children,
}: {
    cols?: number;
    children: ReactNode;
}): ReactNode {
    return (
        <div
            className={styles.cardGroup}
            style={{'--card-cols': cols} as React.CSSProperties}
        >
            {children}
        </div>
    );
}

// Mintlify's newer name for CardGroup; kept so either spelling ports cleanly.
export const Columns = CardGroup;
