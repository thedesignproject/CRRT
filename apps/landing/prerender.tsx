import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'
import { ThemeProvider } from '../../src/design-system'
import { ResourcesPage } from './resources/ResourcesPage'
import { ResourceTool } from './resources/ResourceTool'
import { ResourceArticle } from './resources/ResourceArticle'
import { ResourcesIndex } from './resources/ResourcesIndex'
import { resources, resourcePath } from './resources/content'

export function render(pathname: string) {
  const article = resources.find(resource => resourcePath(resource) === pathname)
  return renderToString(
    <ThemeProvider>
      {pathname === '/' ? <MarketingPage /> : pathname.startsWith('/resources') ? <ResourcesPage pathname={pathname} article={article}>{pathname === '/resources' ? <ResourcesIndex /> : article && <ResourceArticle resource={article} tool={article.tool && <ResourceTool kind={article.tool} />} />}</ResourcesPage> : <DocsApp initialPath={pathname} />}
    </ThemeProvider>,
  )
}
