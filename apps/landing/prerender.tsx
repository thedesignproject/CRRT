import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'
import { ThemeProvider } from '../../src/design-system'
import { ResourcesPage } from './resources/ResourcesPage'
import { resources, resourcePath } from './resources/content'

export function render(pathname: string) {
  return renderToString(
    <ThemeProvider>
      {pathname === '/' ? <MarketingPage /> : pathname.startsWith('/resources') ? <ResourcesPage pathname={pathname} article={resources.find(resource => resourcePath(resource) === pathname)} /> : <DocsApp initialPath={pathname} />}
    </ThemeProvider>,
  )
}
