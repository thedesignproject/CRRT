import type { IncomingMessage, ServerResponse } from 'node:http'
import { publicResponse, type PublicPages } from './public-site.js'

export function createPublicHandler(pages: PublicPages) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost')
    const response = publicResponse(
      url.searchParams.get('__public_path') ?? url.pathname,
      req.headers.accept, req.method!, pages,
    )
    res.writeHead(response.status, response.headers)
    res.end(response.body)
  }
}
