import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
const root = resolve('artifacts/chromatic-simple/storybook')
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' }
createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url!, 'http://localhost').pathname))
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const file = path === root ? resolve(root, 'index.html') : path
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body)
  } catch { response.writeHead(404).end() }
}).listen(4381, '127.0.0.1')
