import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
const root = resolve('storybook-static')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm' }
createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const file = path === root ? resolve(root, 'index.html') : path
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body)
  } catch { response.writeHead(404).end() }
}).listen(Number(process.env.STORYBOOK_PORT ?? 6006), '127.0.0.1', () => console.log(`Storybook: http://127.0.0.1:${process.env.STORYBOOK_PORT ?? 6006}`))
