// @vitest-environment node
import { expect, it } from 'vitest'
import { dashboardOperations, isDashboardRead } from './dashboard-operations.js'
it('loads every allowlisted dashboard handler without inventing proxy routes', async () => {
  expect(new Set(dashboardOperations.map(operation => operation.name)).size).toBe(dashboardOperations.length)
  for (const operation of dashboardOperations) {
    expect(typeof (await operation.load()).default, operation.name).toBe('function')
    expect(operation.required.every(key => operation.query.includes(key)), operation.name).toBe(true)
    expect(operation.query.some(key => key in operation.body), operation.name).toBe(false)
  }
}, 30_000)

it('names every operation as a distinct, directory-compatible tool and omits billing checkout', async () => {
  const { tools } = await import('./tools.js')
  const names = tools.map(tool => tool.name)
  expect(new Set(names).size).toBe(names.length)
  for (const tool of tools) {
    expect(tool.name, tool.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(tool.title.length, tool.name).toBeGreaterThan(0)
  }
  expect(dashboardOperations.map(operation => operation.name)).not.toContain('billing.action')
  expect(dashboardOperations.filter(operation => operation.method === 'DELETE').every(operation => operation.destructive)).toBe(true)
})

it('distinguishes semantic reads from HTTP methods, retaining legacy method defaults', () => {
  expect(isDashboardRead({method:'GET'} as never)).toBe(true)
  expect(isDashboardRead({method:'POST'} as never)).toBe(false)
  expect(isDashboardRead({method:'POST',readOnly:true} as never)).toBe(true)
  expect(isDashboardRead({method:'GET',readOnly:false} as never)).toBe(false)
})
