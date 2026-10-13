import { renderToString } from 'react-dom/server'
import { MarketingPage } from './MarketingPage'
import { DocsApp } from './docs/DocsApp'
import { ThemeProvider } from '../../src/design-system'

export function render(pathname: string) {
  return renderToString(
    <ThemeProvider>
      {pathname === '/' ? <MarketingPage /> : <DocsApp initialPath={pathname} />}
    </ThemeProvider>,
  )
}
