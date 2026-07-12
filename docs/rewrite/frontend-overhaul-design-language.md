# Frontend Overhaul — Design Language & 3D Icon Spec (Pillar 2b)

> The interaction/motion/layout system for the Intellisper overhaul, and the spec the 3D icon set
> (Pillar 2c) is generated against. Built on the existing copper/Kurvant token layer (re-skin), so this
> layers on top — it does not replace tokens. Goal: a modern enterprise feel — rich with graphical
> elements, illustration and motion — but **not heavy** (the user's explicit constraint).

## 1. Visual foundation (inherits from the re-skin tokens)

- **Color:** copper `#B5652F` primary, Kurvant blue `#3B6EF5` + violet `#9B7FE0` secondary, yellow
  `#F5B818` highlight; light-gray light ground, black dark ground. Brand chart ramp `--chart-1..5`.
- **Type:** Sentient (display headings) + Inter (body). Overhaul introduces a tighter type scale and more
  deliberate hierarchy (larger, balanced headings; more whitespace).
- **Surfaces:** layered elevation — `--bg` (canvas) → `--surface` (cards) → floating (popovers/dialogs
  get the strongest shadow). Radius bumped to ~12px for cards, 9px for controls (softer, more modern).
- **Neutrals biased slightly cool** (blue-grey), so they read as chosen, not default.

## 2. Layout rhythm

- **Domain shell:** single left rail (Home + 6 domains), sticky blurred topbar (page title + project
  switcher + New), scrollable content region. Full-screen focus modes for Builder + Table Editor.
- **Grid system:** 8px base; card grids use `gap` (never per-element margins). Content max-width for
  reading surfaces; full-bleed for tables/canvas.
- **Density:** two densities — comfortable (default) and compact (tables/data-heavy). A density toggle is
  a candidate §5 addition, not required.
- **Command-center pattern (Home + dashboards):** summary before detail; state encoded in form (pills,
  severity stripes, sparklines) so what-needs-attention reads at a glance.

## 3. Motion system (deliberate, restrained — "not heavy")

Principle: motion communicates *state change and spatial relationship*, never decoration. Respect
`prefers-reduced-motion` everywhere (all below collapse to instant).

- **Page/route transitions:** 200–250ms fade + 6px rise. One transition, not a cascade.
- **Card/list entrance:** subtle staggered fade-in-up (≤40ms stagger, cap the count) on first paint only;
  never on re-render.
- **Hover micro-interactions:** 120ms ease on background/color; interactive elements lift ≤2px or gain a
  ring. 3D icons get a gentle tilt/parallax on hover (see §5).
- **Skeletons + shimmer:** already in the token set; use for all primary-data loads.
- **Streaming/live:** the AI chat streaming reveal + run "following" pulse stay (existing behavior).
- **Celebration:** confetti on badge award stays (existing).
- **Budget:** no continuous ambient animation on data screens (drains attention + battery). Ambient motion
  only on marketing/auth/empty-state hero surfaces.

## 4. Illustration & graphical richness (without weight)

- **Empty states:** custom lightweight SVG/vector illustrations (brand palette) per domain — replaces
  today's plain icon+text. Inline SVG (no heavy raster).
- **Home hero + domain headers:** subtle geometric brand motifs (the Kurvant arch / Intellisper infinity
  loop) as low-opacity background accents, CSS-drawn or tiny SVG.
- **Data viz:** recharts, brand chart ramp, area fills + emphasized endpoints (per dataviz guidance).
- **Weight guardrails:** prefer CSS/SVG/inline over raster; lazy-load below-the-fold illustration; 3D
  icons delivered as optimized assets (see §5), tier-limited so total payload stays small.

## 5. 3D ICON SYSTEM — the spec (drives Pillar 2c generation)

### 5.1 Two-tier strategy (critical — do NOT 3D-ify everything)
The app uses **256 lucide icons / ~216 distinct glyphs**. 3D-filled treatment on tiny functional icons
(chevrons, spinners, close) hurts legibility and adds weight. So:

- **Tier 1 — Functional micro-icons (stay clean line icons, lucide):** chevrons, arrows, check, x/close,
  loader/spinner, plus/minus, ellipsis, search, caret, sort arrows, drag handles, small inline status
  ticks. ~150+ glyphs. **No 3D.** These are UI plumbing; 3D would be noise.
- **Tier 2 — Semantic / feature / nav / entity icons (get the 3D filled treatment):** the icons that
  carry *meaning* and appear in nav, cards, headers, empty states, entity rows, feature tiles. Estimated
  **~40–60 glyphs**. Examples: Workflow/automation, Table/database, Puzzle/block, Connection/plug, Key/
  secret, Users/team, Globe/global, Zap/trigger, Chart/impact, Trophy/leaderboard, Shield/admin, Robot/
  agent, Calendar, Clock, Bell/alerts, Folder, Rocket, Sparkles/AI, Lock, Bot, Box/package, Activity,
  Server/workers, KeyRound/API, Mail, Home, plus the 6 domain icons.

> Deliverable of Pillar 2c: a **finalized Tier-2 list** (~50 icons) derived from the frequency-ranked
> inventory + nav needs, then generate those. Tier-1 stays lucide.

### 5.2 3D icon visual style (the generation spec)
Cohesive family — every icon must look like it belongs to one set:
- **Form:** soft-extruded / claymorphic-lite. Rounded, filled, gently beveled shapes with a clear front
  face + subtle side depth. NOT hyper-real 3D renders (too heavy, inconsistent), NOT flat.
- **Palette:** each icon uses the brand ramp — copper as the hero material, Kurvant blue/violet/yellow as
  secondary accents per icon's meaning (e.g. secret=copper+lock-yellow; connection=blue+copper; AI=
  violet+copper). Neutral base for structure. Consistent light direction (top-left key light).
- **Depth cues:** a single soft ambient shadow beneath, gentle top highlight, ≤2 material tones per shape.
  Restrained — "dimensional," not "glossy toy."
- **Geometry:** consistent corner radius, stroke weight (if any), and 24×24 logical grid scaled to a
  128×128 or 256×256 render canvas with padding. Optical alignment across the set.
- **Format:** **SVG preferred** (crisp, themeable, tiny) where the style allows; fall back to optimized
  PNG (2x) only if the material look truly needs raster. Must render on BOTH light and dark grounds — so
  icons carry their own contained background/shadow or are designed to sit on any surface.
- **States:** provide (or derive) a subtle hover variant (slight tilt/scale) — can be CSS transform on the
  SVG, no second asset needed.
- **Weight budget:** whole Tier-2 set should be small (target < ~200–300KB total, lazy-loaded). Reject
  any single icon that balloons the budget; re-generate simpler.

### 5.3 Wiring approach (Pillar 2c/3)
- Create an `Icon3D` component that maps a semantic name → the generated asset, with a lucide fallback for
  any Tier-2 name not yet generated (so the app never shows a blank icon mid-migration).
- Replace Tier-2 usages incrementally, per surface, behind the ledger (an icon swap must not change any
  behavior — same click targets, aria-labels, sizes).
- Keep lucide for Tier-1; do not remove the lucide dependency.

## 6. Accessibility (non-negotiable)

- AA contrast on all text/controls both themes (copper split into fill vs text shades already handled).
- Every interactive element has a visible focus ring (`--ring`).
- 3D icons are decorative-with-label: the accessible name comes from adjacent text or `aria-label`, never
  from the icon alone.
- `prefers-reduced-motion` collapses all motion to instant.
- Keyboard parity: every mouse action in the ledger keeps a keyboard path (esp. builder shortcuts).

## 7. What this changes vs. today (the "different feel")

- Flat rail → **domain-grouped rail + Home command-center**.
- Plain icon+text empty states → **branded illustration** empty states.
- Line icons everywhere → **2-tier: 3D semantic icons + line micro-icons**.
- Static lists → **summary-first, state-encoded** surfaces with sparklines/severity.
- Minimal motion → **deliberate, restrained motion system** (transitions, hover, entrance, streaming).
- Modal-buried settings → surfaced; ⌘K promoted to primary nav.
- All of the above **without** continuous ambient animation on data screens (the "not heavy" guardrail).
