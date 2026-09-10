/** Run with: node scripts/verify-public-site.ts https://preview.example.com */
import assert from 'node:assert/strict'
import { publicPages } from '../apps/landing/lib/publicPages.ts'

const base = process.argv[2] || 'http://127.0.0.1:43871'
let checks = 0
for (const page of publicPages) {
  for (const accept of ['text/html', 'text/markdown']) {
    const response = await fetch(new URL(page.path, base), { headers: { Accept: accept } })
    assert.equal(response.status, 200, `${page.path}: status`)
    assert.match(response.headers.get('content-type')!, new RegExp(accept))
    assert.match(response.headers.get('vary')!, /Accept/)
    const body = await response.text()
    assert.ok(body.length > 500, `${page.path}: meaningful content`)
    if (accept === 'text/html') assert.match(body, /<h1[\s>]/)
    else assert.match(body, /^# /m)
    checks++
  }
  const head = await fetch(new URL(page.path, base), { method: 'HEAD', headers: { Accept: 'text/markdown' } })
  assert.equal(head.status, 200); assert.equal(await head.text(), ''); checks++
  const unsupported = await fetch(new URL(page.path, base), { headers: { Accept: 'application/json' } })
  assert.equal(unsupported.status, 406); checks++
}
for (const [path, type] of [
  ['/llms.txt', 'text/plain'], ['/robots.txt', 'text/plain'], ['/sitemap.xml', 'xml'],
  ['/openapi.json', 'application/json'], ['/skill.md', 'text/markdown'], ['/index.md', 'text/markdown'],
  ...publicPages.filter(page => page.path !== '/').map(page => [`${page.path}.md`, 'text/markdown']),
]) {
  const response = await fetch(new URL(path, base))
  assert.equal(response.status, 200, path)
  assert.ok(response.headers.get('content-type')?.includes(type), `${path}: content type`)
  assert.ok((await response.text()).length > 20); checks++
}
for (const path of ['/readiness-does-not-exist', '/docs/readiness-does-not-exist']) {
  for (const accept of ['text/html', 'text/markdown']) {
    const response = await fetch(new URL(path, base), { headers: { Accept: accept } })
    assert.equal(response.status, 404)
    assert.match(await response.text(), /sitemap/); checks++
  }
}
for (const [accept, expected] of [
  ['text/markdown;q=0,text/html;q=1', 'text/html'],
  ['text/html;q=0.1,text/markdown;q=0.9', 'text/markdown'],
  ['*/*', 'text/html'],
]) {
  const response = await fetch(base, { headers: { Accept: accept } })
  assert.ok(response.headers.get('content-type')!.includes(expected)); checks++
}
console.log(`${checks} HTTP checks passed at ${base}`)
