import { ThemeProvider } from '../../src/design-system/theme'
import { readResourceData } from './resources/readResourceData'
import { readResourceCatalog } from './resources/readResourceCatalog'
import { resourcePath } from './resources/model'

/** Leave prerendered content visible while loading only the requested surface. */
export async function loadLandingApp(pathname: string) {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/resources' || path.startsWith('/resources/')) {
    const { ResourcesPage } = await import('./resources/ResourcesPage')
    let article = readResourceData(path)
    if (!article && path !== '/resources' && import.meta.env.DEV) {
      const { resources } = await import('./resources/content')
      article = resources.find(resource => resourcePath(resource) === path)
    }
    let catalog = readResourceCatalog()
    if (!catalog && import.meta.env.DEV) catalog = (await import('./resources/catalog.generated')).resourceCatalog
    const extraTool = article?.tool && !['contrast', 'units', 'feedback'].includes(article.tool) ? (await import('./resources/ExtendedResourceTools')).ExtendedResourceTools : undefined
    return <ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light" hydrate><ResourcesPage catalog={catalog} extraTool={extraTool} pathname={pathname} article={article} /></ThemeProvider>
  }
  const { App } = await import('./App')
  return <App />
}
