import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const repositoryFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

it('keeps privacy and support direct-load routes in both Vercel build paths', () => {
  const generatedOutput = repositoryFile('scripts/build-vercel-output.ts')
  const vercel = JSON.parse(repositoryFile('vercel.json')) as { rewrites: Array<{ source: string; destination: string }> }

  expect(generatedOutput).toContain("{ src: '^/(?:privacy|support)/?$', dest: '/index.html' }")
  expect(vercel.rewrites).toEqual(expect.arrayContaining([
    { source: '/privacy', destination: '/index.html' },
    { source: '/support', destination: '/index.html' },
  ]))
})
