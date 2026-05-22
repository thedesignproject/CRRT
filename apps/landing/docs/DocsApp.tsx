import { useEffect, useState } from 'react'
import { InstallPage } from './pages/Install'
import { SelfHostPage } from './pages/SelfHost'
import { AgentHandoffPage } from './pages/AgentHandoff'

/**
 * Tiny pathname-based router for the /docs/* surface. Avoids pulling in
 * react-router for what is currently a handful of static pages. Same pattern
 * the dashboard's LoginPage uses for /login vs /signup.
 */
export function DocsApp({ initialPath }: { initialPath: string }) {
  const [pathname, setPathname] = useState(initialPath)

  useEffect(() => {
    function onPop() {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(path: string) {
    // Hash links (e.g. "/#install") fall through to a real navigation so the
    // landing's section anchor still works.
    if (path.includes('#') || !path.startsWith('/docs')) {
      window.location.href = path
      return
    }
    if (path === window.location.pathname) return
    window.history.pushState({}, '', path)
    setPathname(path)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // Default unknown /docs/* paths to /docs/install — no 404 page yet, and
  // sending visitors to the starting point is friendlier than a dead end.
  const normalized =
    pathname === '/docs' || pathname === '/docs/'
      ? '/docs/install'
      : pathname

  if (normalized === '/docs/self-host') {
    return <SelfHostPage pathname={normalized} onNavigate={navigate} />
  }
  if (normalized === '/docs/agent-handoff') {
    return <AgentHandoffPage pathname={normalized} onNavigate={navigate} />
  }
  return <InstallPage pathname={normalized} onNavigate={navigate} />
}
