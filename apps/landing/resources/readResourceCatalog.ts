import type { ResourceSummary } from './model'

/** Hydrate only the catalog needed by this document; never evaluate it. */
export function readResourceCatalog(): ResourceSummary[] | undefined {
  const text = document.getElementById('resource-catalog-data')?.textContent
  if (!text) return undefined
  try {
    const data: unknown = JSON.parse(text)
    const sample = {slug:'',title:'',takeaway:'',track:'',minutes:0,category:0}
    if (Array.isArray(data) && data.every(item => item && Object.entries(sample).every(([key,value]) => typeof item[key] === typeof value))) return data
  } catch { /* Keep the safe navigation subset when the document is malformed. */ }
  return undefined
}
