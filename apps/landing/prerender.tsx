import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'

export function render(pathname: string) {
  return renderToString(pathname === '/' ? <MarketingPage /> : <DocsApp initialPath={pathname} />)
}
