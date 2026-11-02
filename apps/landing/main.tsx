import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadLandingApp } from './loadLandingApp'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource/vt323/latin.css'
import '../../src/design-system/styles.css'
import './landing-shell.css'

void loadLandingApp(window.location.pathname).then(app => {
  const root = document.getElementById('root')!
  const content = <React.StrictMode>{app}</React.StrictMode>
  if (root.querySelector('.resources-shell')) ReactDOM.hydrateRoot(root, content)
  else ReactDOM.createRoot(root).render(content)
})
