import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDemoComments } from './demoComments'

const payload = { pageUrl: 'https://crrt.ai/', selector: 'h2', x: 0.5, y: 0.4, body: 'Make the promise clearer.' }
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('creates, reloads, edits, and removes feedback without contacting an API', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  const demo = createDemoComments()
  const comment = await demo.create({ ...payload, imageBase64: 'cG5n', imageMimeType: 'image/png' })
  expect(comment.imageUrl).toBe('data:image/png;base64,cG5n')
  expect(await demo.list('https://crrt.ai/docs')).toEqual([])
  const reloaded = createDemoComments()
  expect(await reloaded.list(payload.pageUrl)).toEqual([comment])
  await reloaded.update(comment.id, 'Updated feedback')
  expect((await reloaded.list(payload.pageUrl))[0].body).toBe('Updated feedback')
  await reloaded.remove(comment.id)
  expect(await createDemoComments().list(payload.pageUrl)).toEqual([])
  expect(fetch).not.toHaveBeenCalled()
})

it('still accepts feedback when session storage is disabled', async () => {
  vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('disabled') })
  const demo = createDemoComments()
  const comment = await demo.create(payload)
  expect(await demo.list(payload.pageUrl)).toEqual([comment])
})

it('recovers from malformed storage and limits the demo history', async () => {
  sessionStorage.setItem('crrt:landing-demo-comments:v1', '{broken')
  const demo = createDemoComments()
  for (let i = 0; i < 32; i++) await demo.create({ ...payload, body: String(i) })
  const comments = await demo.list(payload.pageUrl)
  expect(comments).toHaveLength(30)
  expect(comments[0].body).toBe('31')
})

it('persists text and pins if screenshots exceed the storage quota', async () => {
  const setItem = sessionStorage.setItem.bind(sessionStorage)
  vi.spyOn(sessionStorage, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (value.includes('data:image/')) throw new Error('quota')
    return setItem(key, value)
  })
  const demo = createDemoComments()
  const first = await demo.create({ ...payload, imageBase64: 'cG5n', imageMimeType: 'image/png' })
  const second = await demo.create({ ...payload, body: 'Another comment' })
  await demo.update(first.id, 'Edited')
  expect(await createDemoComments().list(payload.pageUrl)).toEqual([
    second, { ...first, body: 'Edited', imageUrl: null },
  ])
  await demo.remove(first.id)
  expect(await demo.list(payload.pageUrl)).toEqual([second])
})

it.each([{ saved: {} }, { saved: [null, {}, { id: 'x' }, { id: 'x', pageUrl: '/' }, { id: 'x', pageUrl: '/', body: 'a' }, { id: 'x', pageUrl: '/', body: 'a', selector: 'h2' }, { id: 'x', pageUrl: '/', body: 'a', selector: 'h2', x: 1 }] }])('ignores invalid saved comments: %j', async ({ saved }) => {
  sessionStorage.setItem('crrt:landing-demo-comments:v1', JSON.stringify(saved))
  expect(await createDemoComments().list(payload.pageUrl)).toEqual([])
})
