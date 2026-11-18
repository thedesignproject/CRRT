import { expect, it } from 'vitest'
import { blockingAdvisories } from './npm-audit-gate.mjs'

const advisory = (name: string, severity: string, id: string) => ({ name, severity, title: `${name} issue`, url: `https://github.com/advisories/${id}` })

it('ignores reviewed advisories, dependency pointers, and lower severities', () => {
  expect(blockingAdvisories({ vulnerabilities: {
    picomatch: { via: [advisory('picomatch', 'high', 'GHSA-fc5q-39xc-vjpf')] },
    vite: { via: ['picomatch'] },
    minimatch: { via: [advisory('minimatch', 'moderate', 'GHSA-g3hv-75wg-m249')] },
  } })).toEqual([])
})

it('reports each other high or critical advisory once', () => {
  const critical = advisory('example', 'critical', 'GHSA-xxxx-yyyy-zzzz')
  expect(blockingAdvisories({ vulnerabilities: {
    example: { via: [critical] },
    other: { via: [critical, advisory('other', 'high', 'GHSA-aaaa-bbbb-cccc')] },
  } })).toEqual([
    'example: example issue (critical) https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
    'other: other issue (high) https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  ])
})

it('fails when npm audit returns no report', () => {
  for (const report of [null, {}, { error: { code: 'ENOAUDIT' } }]) expect(() => blockingAdvisories(report)).toThrow('npm audit did not return a report')
})
