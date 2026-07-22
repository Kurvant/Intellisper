/**
 * Batch 5 — Memory icons (Intellisper memory feature).
 *
 * Same construction rules as batches 1–4 (see 3d-icon-reference.md): a 96 grid, an extruded
 * `side` layer offset +4y under a `face` layer, a `rim` highlight along the top edge, the inner
 * shadow filter on the focal glyph, and the `glow` overlay last.
 *
 * Palette choice: violet (viFace/viSide) is the family already used by `ai-agent` — memory is the
 * agent's recall, so it reads as the same family rather than a new concept. The focal glyph is a
 * synapse: nodes joined by links, with the centre node in yellow (the accent used for the "active"
 * element across the set).
 */
export const ICONS_BATCH5 = {
  memory: `<svg viewBox="0 0 96 96" fill="none">
  <path d="M28 28 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viSide)" transform="translate(0,4)"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viFace)"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v3 a17 17 0 0 0 -17 -14 h-40 a17 17 0 0 0 -17 14 v-3 a17 17 0 0 1 17 -14 z" fill="url(#rim)"/>
  <g stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".75">
    <line x1="33" y1="38" x2="48" y2="48"/>
    <line x1="33" y1="58" x2="48" y2="48"/>
    <line x1="63" y1="36" x2="48" y2="48"/>
    <line x1="66" y1="56" x2="48" y2="48"/>
    <line x1="63" y1="36" x2="66" y2="56"/>
  </g>
  <g filter="url(#inner)">
    <circle cx="33" cy="38" r="4.6" fill="#fff" opacity=".92"/>
    <circle cx="33" cy="58" r="4" fill="#fff" opacity=".78"/>
    <circle cx="63" cy="36" r="4.2" fill="#fff" opacity=".85"/>
    <circle cx="66" cy="56" r="3.6" fill="#fff" opacity=".7"/>
    <circle cx="48" cy="48" r="7.5" fill="url(#ylFace)" stroke="#fff" stroke-width="1.6"/>
  </g>
  <circle cx="45.6" cy="45.6" r="2.2" fill="#fff" opacity=".85"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#glow)"/>
</svg>`,

  'memory-shared': `<svg viewBox="0 0 96 96" fill="none">
  <path d="M24 28 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viSide)" transform="translate(0,4)"/>
  <path d="M24 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viFace)"/>
  <path d="M24 24 h40 a17 17 0 0 1 17 17 v3 a17 17 0 0 0 -17 -14 h-40 a17 17 0 0 0 -17 14 v-3 a17 17 0 0 1 17 -14 z" fill="url(#rim)"/>
  <g stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7">
    <line x1="30" y1="38" x2="44" y2="48"/>
    <line x1="30" y1="58" x2="44" y2="48"/>
    <line x1="58" y1="38" x2="44" y2="48"/>
  </g>
  <g filter="url(#inner)">
    <circle cx="30" cy="38" r="4.2" fill="#fff" opacity=".9"/>
    <circle cx="30" cy="58" r="3.6" fill="#fff" opacity=".75"/>
    <circle cx="58" cy="38" r="3.6" fill="#fff" opacity=".8"/>
    <circle cx="44" cy="48" r="7" fill="url(#ylFace)" stroke="#fff" stroke-width="1.5"/>
  </g>
  <circle cx="70" cy="62" r="13" fill="url(#cuSide)" transform="translate(0,3)"/>
  <circle cx="70" cy="62" r="13" fill="url(#cuFace)" stroke="#fff" stroke-width="2"/>
  <g stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none">
    <circle cx="65.5" cy="58" r="2.4" fill="#fff" stroke="none"/>
    <circle cx="75" cy="58" r="2.4" fill="#fff" stroke="none"/>
    <circle cx="70" cy="67.5" r="2.4" fill="#fff" stroke="none"/>
    <line x1="66.6" y1="59.6" x2="68.9" y2="65.9"/>
    <line x1="73.9" y1="59.6" x2="71.4" y2="65.9"/>
  </g>
  <path d="M24 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#glow)"/>
</svg>`,
};
