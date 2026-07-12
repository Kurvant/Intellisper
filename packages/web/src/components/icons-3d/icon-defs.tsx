/**
 * Shared gradient/filter <defs> for the 3D icon set. Injected ONCE near the app root
 * (see app.tsx). Every icon in icon-registry.ts references these ids, so the SVG strings
 * stay tiny and the material palette is tuned in one place.
 *
 * Style spec + source of truth: docs/rewrite/overhaul-assets/3d-icon-reference.md
 */
export function Icon3dDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="cuFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC98A" />
          <stop offset=".5" stopColor="#E8863A" />
          <stop offset="1" stopColor="#C86A22" />
        </linearGradient>
        <linearGradient id="cuSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B5651F" />
          <stop offset="1" stopColor="#8A4A17" />
        </linearGradient>
        <linearGradient id="blFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A7C0FF" />
          <stop offset=".5" stopColor="#4D7BFF" />
          <stop offset="1" stopColor="#3358E8" />
        </linearGradient>
        <linearGradient id="blSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3358E8" />
          <stop offset="1" stopColor="#2440B0" />
        </linearGradient>
        <linearGradient id="viFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DECBFB" />
          <stop offset=".5" stopColor="#AB8CF2" />
          <stop offset="1" stopColor="#8A6AE0" />
        </linearGradient>
        <linearGradient id="viSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A6AE0" />
          <stop offset="1" stopColor="#684CB8" />
        </linearGradient>
        <linearGradient id="grFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7DEAB4" />
          <stop offset=".5" stopColor="#1CC062" />
          <stop offset="1" stopColor="#12A150" />
        </linearGradient>
        <linearGradient id="grSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#12A150" />
          <stop offset="1" stopColor="#0B7A3B" />
        </linearGradient>
        <linearGradient id="stFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DDE4EC" />
          <stop offset=".5" stopColor="#A3AFC0" />
          <stop offset="1" stopColor="#7C8898" />
        </linearGradient>
        <linearGradient id="stSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7C8898" />
          <stop offset="1" stopColor="#5B6472" />
        </linearGradient>
        <linearGradient id="ylFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE985" />
          <stop offset="1" stopColor="#F5B411" />
        </linearGradient>
        <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset=".28" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="glow" cx=".32" cy=".22" r=".72">
          <stop offset="0" stopColor="#fff" stopOpacity=".72" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="inner">
          <feOffset dx="0" dy="2" />
          <feGaussianBlur stdDeviation="2" result="o" />
          <feComposite
            in="SourceGraphic"
            in2="o"
            operator="arithmetic"
            k2="-1"
            k3="1"
            result="ish"
          />
          <feColorMatrix
            in="ish"
            values="0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0 0.03  0 0 0 0.35 0"
          />
        </filter>
      </defs>
    </svg>
  );
}
