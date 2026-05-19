import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import tokensRaw from '../../branding/crrt/tokens.css?raw'
import './globals.css'

const style = document.createElement('style')
style.textContent = tokensRaw
document.head.prepend(style)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
