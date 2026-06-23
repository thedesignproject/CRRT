import vt323FontUrl from './fonts/vt323.ttf?url'

const FONT_STYLE_ID = 'crrt-widget-fonts'

export function ensureWidgetFonts() {
  if (typeof document === 'undefined') return
  if (document.getElementById(FONT_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = FONT_STYLE_ID
  style.textContent = `
@font-face {
  font-family: 'VT323';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${vt323FontUrl}') format('truetype');
}
`
  document.head.appendChild(style)
}
