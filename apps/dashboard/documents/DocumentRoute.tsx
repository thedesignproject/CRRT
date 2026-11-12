import { DocumentReader } from './DocumentReader'
import { LoginPage } from '../components/LoginPage'
import { route } from '../lib/routes'
export function documentRoute(pathname: string, apiBase: string, session: string | null = null, userId: string | null = null) {
  const login = pathname.match(/^\/doc\/([0-9a-f-]{36})\/login$/i)
  if (login) return <LoginPage continuationPath={route(`/doc/${login[1]}`)} />
  const match = pathname.match(/^\/doc\/([0-9a-f-]{36})$/i)
  return match ? <DocumentReader key={match[1]} apiBase={apiBase} shareKey={match[1]} session={session} userId={userId} /> : null
}
