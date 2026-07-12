import { HelpCircle, LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { ICON_SVGS } from './icon-registry';

type Icon3dProps = {
  /** Semantic icon name (a key of the 3D registry, e.g. "automation", "table"). */
  name: string;
  /** Rendered box size in px (default 24). The SVG is a 96-grid scaled to fit. */
  size?: number;
  className?: string;
  /**
   * Fallback line icon used when `name` is not in the 3D registry. Lets surfaces migrate
   * to 3D icons incrementally without ever rendering a blank icon. Defaults to a help glyph.
   */
  fallback?: LucideIcon;
  /**
   * Accessible label. When omitted the icon is decorative (aria-hidden) — provide a nearby
   * text label instead, per the design-language accessibility rule.
   */
  title?: string;
};

/**
 * Renders a faux-3D SVG icon from the shared registry. The gradient/filter defs are injected
 * once at app root by <Icon3dDefs/>, so this only emits the (tiny) icon body.
 *
 * A swap from a line icon to <Icon3d/> must never change behavior — same box size and click
 * target; keep any existing aria-label on the surrounding control.
 */
export function Icon3d({
  name,
  size = 24,
  className,
  fallback: Fallback = HelpCircle,
  title,
}: Icon3dProps) {
  const svg = ICON_SVGS[name];
  const decorative = title == null;

  if (!svg) {
    return (
      <Fallback
        className={className}
        size={size}
        aria-hidden={decorative || undefined}
        aria-label={title}
      />
    );
  }

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={title}
      className={cn('inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
      // Icon SVGs are static, author-controlled strings from icon-registry.ts (no user input).
      dangerouslySetInnerHTML={{ __html: sizeSvg(svg, size) }}
    />
  );
}

function sizeSvg(svg: string, size: number): string {
  // The registry SVGs intentionally omit width/height so the box can size them; inject the
  // requested px so the glyph fills its span crisply.
  return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
}
