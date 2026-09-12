import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import tokensRaw from '../../branding/crrt/tokens.css?raw'
import './globals.css'
import '@fontsource-variable/figtree/wght.css'
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
