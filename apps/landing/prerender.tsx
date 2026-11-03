import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'
import { ThemeProvider } from '../../src/design-system'
import { ExtendedResourceTools } from './resources/ExtendedResourceTools'
import { ResourcesPage } from './resources/ResourcesPage'
import { resourceCatalog } from './resources/catalog.generated'
import { menuCatalog } from './resources/menuCatalog.generated'
import { resources, resourcePath } from './resources/content'

export function render(pathname: string) {
  const article = resources.find(resource => resourcePath(resource) === pathname)
  const catalog = pathname === '/resources' ? resourceCatalog : [...new Map([...menuCatalog, ...resourceCatalog.filter(item => article?.related.includes(item.slug))].map(item => [item.slug,item])).values()]
  return renderToString(
    <ThemeProvider>
      {pathname === '/' ? <MarketingPage /> : pathname.startsWith('/resources') ? <ResourcesPage catalog={catalog} extraTool={ExtendedResourceTools} pathname={pathname} article={article} /> : <DocsApp initialPath={pathname} />}
    </ThemeProvider>,
  )
}
