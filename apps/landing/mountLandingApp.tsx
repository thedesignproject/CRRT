import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadLandingApp } from './loadLandingApp'

export async function mountLandingApp(pathname: string) {
  const app = await loadLandingApp(pathname)
  const root = document.getElementById('root')!
  const content = <React.StrictMode>{app}</React.StrictMode>
  if (root.querySelector('.resources-shell')) ReactDOM.hydrateRoot(root, content)
  else ReactDOM.createRoot(root).render(content)
}
