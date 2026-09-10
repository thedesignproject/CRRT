import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { publicResponse } from '../server/public-site.ts'
import { publicPagePattern, applicationFallbackRoutes } from './public-pages.ts'

const dist = resolve(import.meta.dirname, '../apps/landing/dist')
const pages = JSON.parse(await readFile(join(dist, 'public-pages.json'), 'utf8'))
const types: Record<string, string> = { '.html': 'text/html', '.md': 'text/markdown', '.txt': 'text/plain', '.json': 'application/json', '.xml': 'application/xml', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.ttf': 'font/ttf' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url!, 'http://localhost').pathname
  let file = resolve(dist, '.' + decodeURIComponent(path))
  if (!new RegExp(publicPagePattern).test(path) && file.startsWith(dist + '/') && !file.endsWith('/public-pages.json')) {
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : data); return
    } catch { /* Continue through application rewrites and the real 404. */ }
    const route = applicationFallbackRoutes.slice(0, -1).find(route => new RegExp(route.src).test(path))
    if (route) {
      try {
        const data = await readFile(join(dist, route.dest))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(req.method === 'HEAD' ? undefined : data); return
      } catch { /* A missing dashboard build remains a 404. */ }
    }
  }
  const result = publicResponse(path, req.headers.accept, req.method!, pages)
  res.writeHead(result.status, result.headers); res.end(result.body)
})
server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => console.log(`CRRT public preview: http://127.0.0.1:${process.env.PORT || 4317} (API requires deployed preview)` ))
