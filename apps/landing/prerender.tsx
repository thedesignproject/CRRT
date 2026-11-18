import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'
import { ThemeProvider } from '../../src/design-system'
import { ResourcesPage } from './resources/ResourcesPage'
import { ResourceTool } from './resources/ResourceTool'
import { ResourceArticle } from './resources/ResourceArticle'
import { ResourcesIndex } from './resources/ResourcesIndex'
import { resources, resourcePath } from './resources/content'
import { PrivacyPage } from './legal/PrivacyPage'
import { SupportPage } from './legal/SupportPage'
import { TermsPage } from './legal/TermsPage'

const legalPages: Partial<Record<string, ComponentType>> = { '/privacy': PrivacyPage, '/support': SupportPage, '/terms': TermsPage }

export function render(pathname: string) {
  const article = resources.find(resource => resourcePath(resource) === pathname)
  const Legal = legalPages[pathname]
  return renderToString(
    <ThemeProvider>
      {pathname === '/' ? <MarketingPage /> : Legal ? <Legal /> : pathname.startsWith('/resources') ? <ResourcesPage pathname={pathname} article={article}>{pathname === '/resources' ? <ResourcesIndex /> : article && <ResourceArticle resource={article} tool={article.tool && <ResourceTool kind={article.tool} />} />}</ResourcesPage> : <DocsApp initialPath={pathname} />}
    </ThemeProvider>,
  )
}
