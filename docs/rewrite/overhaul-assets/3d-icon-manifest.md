# 3D Icon Manifest — Tier-2 semantic icons to generate (~52)

> The finalized list of semantic/feature/nav/entity/empty-state icons that get the faux-3D SVG
> treatment (v2 spec — see ../frontend-overhaul-design-language.md §5.2). Tier-1 micro-icons stay lucide.
> Each generated as a self-contained SVG (96 viewBox, brand-gradient material, extruded side face, rim
> light, radial glow, grounded shadow). Accent-color guidance per icon in the "Material" column.
>
> Naming: semantic name (kebab) → the Icon3D component key. "Lucide src" = the current icon(s) it
> replaces (for the mapping table). Icon3D falls back to Lucide src if a 3D asset is missing.

## Domain / nav icons (7)
| name | Lucide src | Material (accent) |
|---|---|---|
| home | Home/LayoutGrid | copper + yellow spark |
| build | Workflow/Wrench | copper |
| operate | Activity/Radio | blue |
| data | Table2/Database | blue |
| connect | Plug/Link2/Cable | blue + copper node |
| insights | LineChart/BarChart3 | violet + copper |
| admin | Shield | copper + steel |

## Entity / feature icons (24)
| name | Lucide src | Material (accent) |
|---|---|---|
| automation | Workflow/Zap | copper + yellow bolt |
| flow | Workflow/GitBranch | copper |
| table | Table2 | blue grid |
| block | Puzzle | copper + violet |
| connection | Link2/Cable/Unplug | blue+copper plug + yellow node |
| variable | Variable/Braces | violet |
| secret | Key/KeyRound/Lock | copper + yellow key |
| ai-agent | Sparkles/Bot | violet + yellow sparkle |
| chat | MessageSquare | blue |
| template | LayoutGrid/BookOpen | copper + blue |
| folder | Folder | copper |
| run | Play/Activity | green + copper |
| trigger | Zap | yellow + copper |
| user | User | copper |
| team | Users | blue + copper |
| project | LayoutGrid/Box | copper facets |
| global-connection | Globe | blue globe + copper ring |
| api-key | KeyRound | copper + steel |
| webhook | Webhook/Radio | blue |
| mcp | Server/Braces | violet |
| tag | Tag | yellow |
| calendar | Calendar/CalendarDays | copper + blue |
| clock | Clock/Timer | copper |
| package | Package/Box | copper |

## Insight / status feature icons (8)
| name | Lucide src | Material (accent) |
|---|---|---|
| impact | LineChart/TrendingUp | violet + copper |
| leaderboard | Trophy | yellow + copper |
| audit | ScrollText/FileText | copper |
| analytics | BarChart3/Activity | blue + violet |
| health | Activity/HeartPulse | green |
| workers | Server/Cpu/HardDrive | steel + blue |
| trigger-health | Radio/Activity | blue |
| billing | CreditCard/Wallet | copper + yellow |

## Admin / setup feature icons (7)
| name | Lucide src | Material (accent) |
|---|---|---|
| sso | ShieldCheck/Fingerprint | copper + blue |
| roles | ShieldUser/Users | blue |
| embed | Code/Braces | violet |
| branding | Palette/Paintbrush | copper + yellow + violet (multi) |
| ai-providers | Sparkles/Cpu | violet |
| event-stream | Radio/Waypoints | blue |
| infrastructure | Server/HardDrive | steel |

## Empty-state / hero icons (6) — slightly larger, more illustrative
| name | Lucide src | Material (accent) |
|---|---|---|
| empty-flows | Workflow | copper + scene |
| empty-tables | Table2 | blue + scene |
| empty-connections | Plug | blue+copper |
| empty-runs | Activity | green |
| rocket | Rocket | copper + blue flame + yellow |
| bell-alert | Bell/BellPlus | copper + red dot |

**Total: ~52 icons.**

## Tier-1 (STAY lucide line icons — do NOT 3D-ify)
chevron-{down,up,left,right}, chevrons-up-down, check, check-circle(inline), x, x-circle, plus, minus,
loader2/spinner, search/search-x, pencil(inline edit), trash/trash2(inline), copy, eye/eye-off,
more-horizontal, more-vertical, grip-vertical, arrow-{up,down,left,right}, external-link, refresh-cw/ccw,
download/upload/upload-cloud/import, paperclip, info, alert-circle, alert-triangle, triangle-alert,
circle-help, toggle-left, type, text, hash, file, file-text, image, history, rotate-ccw, copy-plus,
settings(inline), lightbulb, git-branch(inline), link2(inline), timer(inline), play(inline small).

## Generation rules (for sub-agents)
1. One SVG per icon, `viewBox="0 0 96 96"`, no width/height attrs (sized by CSS).
2. Reference SHARED gradient/filter defs by id (do NOT inline a `<defs>` per icon — the app injects one
   shared def block). Gradient ids: cuFace, cuSide, blFace, blSide, viFace, viSide, ylFace, greenFace,
   steelFace, rim, glow, inner. (Sub-agents get the exact def block.)
3. Structure per icon: [side-face path translate(0,4)] → [front-face path] → [rim-light sliver] →
   [inner detail w/ accent + optional filter="url(#inner)"] → [radial glow overlay].
4. Consistent light: top-left key, rim on top edge, shadow below.
5. Keep total path complexity modest (few KB). Optically center in ~72px of the 96 box.
6. Return: `export const <name>Svg = \`<svg ...>...</svg>\`;` style, or raw SVG string keyed by name.
