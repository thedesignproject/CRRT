import { ThemeProvider } from '../../src/design-system/theme'
import { readResourceData } from './resources/readResourceData'
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
    // Await the tool before hydration so its prerendered controls stay intact.
    let content
    if (path === '/resources') {
      const { ResourcesIndex } = await import('./resources/ResourcesIndex')
      content = <ResourcesIndex />
    } else if (article) {
      const { ResourceArticle } = await import('./resources/ResourceArticle')
      let tool
      if (article.tool) {
        const { ResourceTool } = await import('./resources/ResourceTool')
        tool = <ResourceTool kind={article.tool} />
      }
      content = <ResourceArticle resource={article} tool={tool} />
    }
    return <ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light" hydrate><ResourcesPage pathname={pathname} article={article}>{content}</ResourcesPage></ThemeProvider>
  }
  const { App } = await import('./App')
  return <App />
}
