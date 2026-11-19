import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '../posthog'
import '../speed-insights'
import tokensRaw from '../../branding/crrt/tokens.css?raw'
import './globals.css'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource/inter-tight/latin-400.css'
import '@fontsource/inter-tight/latin-500.css'
import '@fontsource/inter-tight/latin-600.css'
import '@fontsource/inter-tight/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/vt323/latin.css'
import { applyDashboardTheme, getDashboardTheme } from './lib/theme'

const style = document.createElement('style')
style.textContent = tokensRaw
document.head.prepend(style)
applyDashboardTheme(getDashboardTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
