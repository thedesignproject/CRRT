import { afterEach, expect, it } from 'vitest'
import { resources, resourcePath } from './content'
import { readResourceData } from './readResourceData'

afterEach(() => document.getElementById('resource-page-data')?.remove())

function embed(text: string) {
  const script = document.createElement('script')
  script.type = 'application/json'; script.id = 'resource-page-data'; script.textContent = text
  document.body.append(script)
}

it('reads only the current article from its non-executable data element', () => {
  embed(JSON.stringify(resources[0]))
  expect(readResourceData(`${resourcePath(resources[0])}/`)).toEqual(resources[0])
  expect(readResourceData(resourcePath(resources[1]))).toBeUndefined()
})

it('rejects absent, malformed, and incomplete article data', () => {
  expect(readResourceData('/resources/missing')).toBeUndefined()
  embed('')
  expect(readResourceData('/resources/missing')).toBeUndefined()
  const script = document.getElementById('resource-page-data')!
  for (const text of ['{bad', 'null', '{"slug":1}', ...['sections', 'questions', 'sources'].map(key => JSON.stringify({ ...resources[0], [key]: null }))]) {
    script.textContent = text
    expect(readResourceData(resourcePath(resources[0]))).toBeUndefined()
  }
})
