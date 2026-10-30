import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource/vt323/latin.css'
import '../../src/design-system/styles.css'
import './globals.css'
import './marketing-polish.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
