// @vitest-environment node
import { expect, it } from 'vitest'
import { dashboardOperations, isDashboardRead } from './dashboard-operations.js'
it('loads every allowlisted dashboard handler without inventing proxy routes', async () => {
  expect(new Set(dashboardOperations.map(operation => operation.name)).size).toBe(dashboardOperations.length)
  for (const operation of dashboardOperations) {
    expect(typeof (await operation.load()).default, operation.name).toBe('function')
    expect(operation.required.every(key => operation.query.includes(key)), operation.name).toBe(true)
  }
})

it('distinguishes semantic reads from HTTP methods, retaining legacy method defaults', () => {
  expect(isDashboardRead({method:'GET'} as never)).toBe(true)
  expect(isDashboardRead({method:'POST'} as never)).toBe(false)
  expect(isDashboardRead({method:'POST',readOnly:true} as never)).toBe(true)
  expect(isDashboardRead({method:'GET',readOnly:false} as never)).toBe(false)
})
