import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// Load tokens.css as a raw string and inject before any other styles. This keeps
// branding/crrt/tokens.css as the single source of truth and bypasses PostCSS,
// which otherwise hoists tailwindcss output above tokens.css and trips the
// "@import must precede all other statements" rule on tokens.css's webfont import.
import tokensCss from '../../branding/crrt/tokens.css?raw'
import './globals.css'

const tokensStyle = document.createElement('style')
tokensStyle.setAttribute('data-source', 'crrt-tokens')
tokensStyle.textContent = tokensCss
document.head.prepend(tokensStyle)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
