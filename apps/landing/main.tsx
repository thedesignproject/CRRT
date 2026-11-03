import '@fontsource-variable/figtree/wght.css'
import '@fontsource/vt323/latin.css'
import '../../src/design-system/styles.css'
import './landing-shell.css'

const mount = () => { void import('./mountLandingApp').then(module => module.mountLandingApp(window.location.pathname)) }
// Public resource HTML is already complete. Give it a paint before fetching
// the interactive renderer so reading does not wait on application JavaScript.
if (document.getElementById('root')!.querySelector('.resources-shell')) {
  requestAnimationFrame(() => requestAnimationFrame(mount))
} else mount()
