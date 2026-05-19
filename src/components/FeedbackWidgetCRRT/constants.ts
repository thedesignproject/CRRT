export const WIDGET_ATTR = 'data-fw-crrt'

/* CRRT carrot gradient — replaces the blue dot.
 * Bright highlight at top, carrot body, deeper carrot shadow at the edge. */
export const PIN_GRADIENT =
  'radial-gradient(circle at 50% 35%, #FFD9B5 0%, #F4A661 22%, #E8853D 55%, #B85F1F 100%)'

export const NOISE_OVERLAY_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>\")"

/* CRRT avatar palette — carrot family + phosphor + forest. Single accent rule
 * is for the system; avatars get a tighter, warmer set than the blue widget. */
export const AVATAR_COLORS = [
  '#E8853D', // Carrot
  '#B85F1F', // Carrot Deep
  '#FFB000', // Phosphor Amber
  '#1F3A2F', // Forest
  '#6B6560', // Mute
  '#2C2C2C', // Ink Soft
  '#A8A29A', // Ink Faint
  '#FFFCF6', // Cream Card
]

export const AUTHOR_NAME_KEY = 'fw-crrt-author-name'

export const COMMENT_CUTOFF = new Date('2026-04-19T00:00:00Z')
