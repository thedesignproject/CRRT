import { resourcePath, type Resource } from './model'

/** Article data is generated into the public HTML, not fetched from an API. */
export function readResourceData(pathname: string): Resource | undefined {
  const text = document.getElementById('resource-page-data')?.textContent
  if (!text) return undefined
  try {
    const data = JSON.parse(text) as Resource
    if (data && typeof data.slug === 'string' && Array.isArray(data.sections) && Array.isArray(data.questions) && Array.isArray(data.sources) && resourcePath(data) === pathname.replace(/\/+$/, '')) return data
  } catch { /* A malformed document must not execute or replace trusted data. */ }
  return undefined
}
