type QueryValue = string | string[]

type LocalRequest = {
  method?: string
  headers: Record<string, string>
  query: Record<string, QueryValue>
  body?: unknown
}

type Route = {
  file: string
  pattern: RegExp
  parameterNames: string[]
}

const root = new URL('../', import.meta.url)
const routeFiles = Array.from(new Bun.Glob('api/**/*.ts').scanSync({ cwd: root.pathname }))
  .filter((file) => !file.includes('/_lib/') && !file.endsWith('.test.ts'))

function buildRoute(file: string): Route {
  const parameterNames: string[] = []
  const routePath = `/${file.replace(/\.ts$/, '').replace(/\/index$/, '')}`
  const pattern = routePath
    .split('/')
    .map((segment) => {
      const match = segment.match(/^\[([^\]]+)\]$/)
      if (match) {
        parameterNames.push(match[1])
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')

  return { file, pattern: new RegExp(`^${pattern}/?$`), parameterNames }
}

const routes = routeFiles
  .map(buildRoute)
  .sort((left, right) => left.parameterNames.length - right.parameterNames.length)

function addQueryValue(query: Record<string, QueryValue>, key: string, value: string) {
  const current = query[key]
  query[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value]
}

async function parseBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const body = await request.text()
  if (!body) return undefined
  if (request.headers.get('content-type')?.includes('application/json')) return JSON.parse(body)
  return body
}

function createResponseAdapter() {
  let statusCode = 200
  let body: BodyInit | null = null
  const headers = new Headers()

  const response = {
    status(code: number) {
      statusCode = code
      return response
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.delete(name)
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item))
      return response
    },
    json(value: unknown) {
      headers.set('content-type', 'application/json; charset=utf-8')
      body = JSON.stringify(value)
      return response
    },
    send(value: unknown) {
      body = typeof value === 'string' ? value : JSON.stringify(value)
      return response
    },
    end(value?: unknown) {
      if (value !== undefined) body = String(value)
      return response
    },
    toWebResponse() {
      return new Response(statusCode === 204 || statusCode === 304 ? null : body, { status: statusCode, headers })
    },
  }

  return response
}

const port = Number(process.env.LOCAL_API_PORT ?? 3001)

Bun.serve({
  hostname: '127.0.0.1',
  port,
  async fetch(request) {
    const url = new URL(request.url)
    const route = routes.find((candidate) => candidate.pattern.test(url.pathname))
    if (!route) return Response.json({ error: 'Not found' }, { status: 404 })

    try {
      const match = route.pattern.exec(url.pathname)
      const query: Record<string, QueryValue> = {}
      for (const [key, value] of url.searchParams) addQueryValue(query, key, value)
      route.parameterNames.forEach((name, index) => {
        query[name] = decodeURIComponent(match?.[index + 1] ?? '')
      })

      const localRequest: LocalRequest = {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        query,
        body: await parseBody(request),
      }
      const localResponse = createResponseAdapter()
      const module = await import(new URL(`../${route.file}`, import.meta.url).href)
      await module.default(localRequest, localResponse)
      return localResponse.toWebResponse()
    } catch (error) {
      console.error('Local API request failed', error instanceof Error ? error.message : 'Unknown error')
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
})

console.log(`CRRT local API ready at http://127.0.0.1:${port}`)
