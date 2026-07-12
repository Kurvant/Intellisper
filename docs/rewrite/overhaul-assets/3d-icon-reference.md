# 3D Icon Reference — shared defs + 4 canonical examples (build ALL icons to match these)

## Shared defs block (the app injects this ONCE; icons reference by id — do NOT re-declare per icon)

```svg
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="cuFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC98A"/><stop offset=".5" stop-color="#E8863A"/><stop offset="1" stop-color="#C86A22"/></linearGradient>
  <linearGradient id="cuSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B5651F"/><stop offset="1" stop-color="#8A4A17"/></linearGradient>
  <linearGradient id="blFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A7C0FF"/><stop offset=".5" stop-color="#4D7BFF"/><stop offset="1" stop-color="#3358E8"/></linearGradient>
  <linearGradient id="blSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3358E8"/><stop offset="1" stop-color="#2440B0"/></linearGradient>
  <linearGradient id="viFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DECBFB"/><stop offset=".5" stop-color="#AB8CF2"/><stop offset="1" stop-color="#8A6AE0"/></linearGradient>
  <linearGradient id="viSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A6AE0"/><stop offset="1" stop-color="#684CB8"/></linearGradient>
  <linearGradient id="grFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DEAB4"/><stop offset=".5" stop-color="#1CC062"/><stop offset="1" stop-color="#12A150"/></linearGradient>
  <linearGradient id="grSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12A150"/><stop offset="1" stop-color="#0B7A3B"/></linearGradient>
  <linearGradient id="stFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DDE4EC"/><stop offset=".5" stop-color="#A3AFC0"/><stop offset="1" stop-color="#7C8898"/></linearGradient>
  <linearGradient id="stSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C8898"/><stop offset="1" stop-color="#5B6472"/></linearGradient>
  <linearGradient id="ylFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE985"/><stop offset="1" stop-color="#F5B411"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".28" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="glow" cx=".32" cy=".22" r=".72"><stop offset="0" stop-color="#fff" stop-opacity=".72"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="inner"><feOffset dx="0" dy="2"/><feGaussianBlur stdDeviation="2" result="o"/><feComposite in="SourceGraphic" in2="o" operator="arithmetic" k2="-1" k3="1" result="ish"/><feColorMatrix in="ish" values="0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0 0.03  0 0 0 0.35 0"/></filter>
</defs></svg>
```

Available material pairs: copper `cuFace/cuSide`, blue `blFace/blSide`, violet `viFace/viSide`,
green `grFace/grSide`, steel `stFace/stSide`, yellow accent `ylFace`. Overlays: `rim`, `glow`, `inner`.

## Anatomy every icon MUST follow (in this z-order)
1. **Side face** — same silhouette as the front, filled with the `*Side` gradient, `transform="translate(0,4)"` (the extrusion depth).
2. **Front face** — the silhouette filled with the `*Face` gradient.
3. **Rim light** — a thin sliver along the TOP edge of the front face filled with `url(#rim)`.
4. **Inner detail** — the glyph's distinguishing marks (grid lines, bolt, sparkle, keyhole…), usually white at partial opacity or a `ylFace` accent; use `filter="url(#inner)"` on inset accent shapes.
5. **Glow overlay** — repeat the front-face silhouette filled with `url(#glow)` (top-left sheen).

`viewBox="0 0 96 96"`, NO width/height attributes. Optically center content in ~72px, leaving padding.

## 4 canonical reference icons (match this exact quality/structure)

### automation (copper + yellow bolt)
```svg
<svg viewBox="0 0 96 96" fill="none">
  <path d="M24 30 h48 a14 14 0 0 1 14 14 v18 a14 14 0 0 1 -14 14 h-48 a14 14 0 0 1 -14 -14 v-18 a14 14 0 0 1 14 -14 z" fill="url(#cuSide)" transform="translate(0,4)"/>
  <path d="M24 26 h48 a14 14 0 0 1 14 14 v18 a14 14 0 0 1 -14 14 h-48 a14 14 0 0 1 -14 -14 v-18 a14 14 0 0 1 14 -14 z" fill="url(#cuFace)"/>
  <path d="M24 26 h48 a14 14 0 0 1 14 14 v3 a14 14 0 0 0 -14 -14 h-48 a14 14 0 0 0 -14 14 v-3 a14 14 0 0 1 14 -14 z" fill="url(#rim)"/>
  <path d="M54 33 L37 55 L48 55 L44 66 L61 44 L50 44 Z" fill="url(#ylFace)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" filter="url(#inner)"/>
  <path d="M24 26 h48 a14 14 0 0 1 14 14 v18 a14 14 0 0 1 -14 14 h-48 a14 14 0 0 1 -14 -14 v-18 a14 14 0 0 1 14 -14 z" fill="url(#glow)"/>
</svg>
```

### table (blue + white grid)
```svg
<svg viewBox="0 0 96 96" fill="none">
  <path d="M22 28 h52 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-52 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z" fill="url(#blSide)" transform="translate(0,4)"/>
  <path d="M22 24 h52 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-52 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z" fill="url(#blFace)"/>
  <path d="M22 24 h52 a12 12 0 0 1 12 12 v3 a12 12 0 0 0 -12 -12 h-52 a12 12 0 0 0 -12 12 v-3 a12 12 0 0 1 12 -12 z" fill="url(#rim)"/>
  <g stroke="#fff" stroke-linecap="round">
    <line x1="18" y1="44" x2="78" y2="44" stroke-width="3" opacity=".85"/><line x1="18" y1="57" x2="78" y2="57" stroke-width="2.6" opacity=".55"/>
    <line x1="42" y1="34" x2="42" y2="70" stroke-width="2.6" opacity=".6"/><line x1="60" y1="34" x2="60" y2="70" stroke-width="2.6" opacity=".45"/>
  </g>
  <path d="M22 24 h52 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-52 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z" fill="url(#glow)"/>
</svg>
```

### connection (blue + copper plugs, yellow node)
```svg
<svg viewBox="0 0 96 96" fill="none">
  <g transform="translate(0,4)"><rect x="16" y="36" width="30" height="24" rx="11" fill="url(#blSide)"/></g>
  <rect x="16" y="32" width="30" height="24" rx="11" fill="url(#blFace)"/>
  <path d="M27 32 h8 a11 11 0 0 1 11 11 v2 a11 11 0 0 0 -11 -11 h-8 a11 11 0 0 0 -11 11 v-2 a11 11 0 0 1 11 -11z" fill="url(#rim)"/>
  <g transform="translate(0,4)"><rect x="50" y="40" width="30" height="24" rx="11" fill="url(#cuSide)"/></g>
  <rect x="50" y="36" width="30" height="24" rx="11" fill="url(#cuFace)"/>
  <circle cx="48" cy="46" r="9" fill="url(#ylFace)" stroke="#fff" stroke-width="1.8"/><circle cx="45" cy="43" r="2.6" fill="#fff" opacity=".85"/>
  <rect x="16" y="32" width="64" height="28" fill="url(#glow)"/>
</svg>
```

### ai-agent (violet + yellow sparkle)
```svg
<svg viewBox="0 0 96 96" fill="none">
  <path d="M28 28 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viSide)" transform="translate(0,4)"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#viFace)"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v3 a17 17 0 0 0 -17 -14 h-40 a17 17 0 0 0 -17 14 v-3 a17 17 0 0 1 17 -14 z" fill="url(#rim)"/>
  <path d="M48 32 L52 45 L65 49 L52 53 L48 66 L44 53 L31 49 L44 45 Z" fill="url(#ylFace)" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" filter="url(#inner)"/>
  <circle cx="66" cy="31" r="3.4" fill="#fff" opacity=".9"/><circle cx="32" cy="60" r="2.4" fill="#fff" opacity=".7"/>
  <path d="M28 24 h40 a17 17 0 0 1 17 17 v10 a17 17 0 0 1 -17 17 h-40 a17 17 0 0 1 -17 -17 v-10 a17 17 0 0 1 17 -17 z" fill="url(#glow)"/>
</svg>
```
