import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: false, steps: vi.fn(), runs: vi.fn() }))
vi.mock('../api', () => ({ listNextSteps: mocks.steps, listAgentRuns: mocks.runs }))
vi.mock('../lib/mocks', () => ({
  get mocksEnabled() { return mocks.enabled },
  getMockNextSteps: (key: string) => [`mock step ${key}`],
  getMockAgentRuns: (key: string) => [`mock run ${key}`],
}))
import { useAgentRuns, useNextSteps, useProjectData } from './useProjectData'

beforeEach(() => { mocks.enabled = false; mocks.steps.mockReset(); mocks.runs.mockReset() })

it('loads nothing without a project', () => {
  const load = vi.fn()
  const { result } = renderHook(() => useProjectData(load, null, ''))
  expect(load).not.toHaveBeenCalled()
  expect(result.current).toMatchObject({ data: null, error: null })
})

it('reloads on a new refresh key or reload, keeping the last result meanwhile', async () => {
  const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second').mockResolvedValueOnce('third')
  const { result, rerender } = renderHook(({ key }) => useProjectData(load, 'p', key), { initialProps: { key: 'a' } })
  await waitFor(() => expect(result.current.data).toBe('first'))
  rerender({ key: 'b' })
  expect(result.current.data).toBe('first')
  await waitFor(() => expect(result.current.data).toBe('second'))
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.data).toBe('third'))
  expect(load).toHaveBeenCalledWith('p')
})

it('reports errors and hides another project\'s result', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce('boom').mockReturnValueOnce(new Promise(() => {}))
  const { result, rerender } = renderHook(({ project, key }) => useProjectData(load, project, key), { initialProps: { project: 'p', key: 'a' } })
  await waitFor(() => expect(result.current.error).toBe('Offline'))
  rerender({ project: 'p', key: 'b' })
  await waitFor(() => expect(result.current.error).toBe('Could not load'))
  rerender({ project: 'q', key: 'b' })
  expect(result.current).toMatchObject({ data: null, error: null })
})

it('drops a result or failure that arrives after the project changed', async () => {
  let finish: (value: string) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const load = vi.fn()
    .mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    .mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
    .mockResolvedValueOnce('r data')
  const { result, rerender } = renderHook(({ project }) => useProjectData(load, project, ''), { initialProps: { project: 'p' } })
  rerender({ project: 'q' })
  rerender({ project: 'r' })
  await waitFor(() => expect(result.current.data).toBe('r data'))
  await act(async () => { finish('p data'); fail(new Error('late')) })
  expect(result.current).toMatchObject({ data: 'r data', error: null })
})

it('loads next steps and agent runs from the API, or mocks in preview mode', async () => {
  mocks.steps.mockResolvedValue(['step'])
  mocks.runs.mockResolvedValue(['run'])
  const api = renderHook(() => [useNextSteps('/api', 'token', 'p', ''), useAgentRuns('/api', 'token', 'p', '')])
  await waitFor(() => expect(api.result.current.map((r) => r.data)).toEqual([['step'], ['run']]))
  expect(mocks.steps).toHaveBeenCalledWith('/api', 'token', 'p')
  expect(mocks.runs).toHaveBeenCalledWith('/api', 'token', 'p')
  mocks.enabled = true
  const preview = renderHook(() => [useNextSteps('/api', 'token', 'p', ''), useAgentRuns('/api', 'token', 'p', '')])
  await waitFor(() => expect(preview.result.current.map((r) => r.data)).toEqual([['mock step p'], ['mock run p']]))
})
