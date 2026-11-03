import { createContext, useContext } from 'react'
import type { ResourceSummary } from './model'
import { menuCatalog } from './menuCatalog.generated'

export const ResourceCatalogContext = createContext<ResourceSummary[]>(menuCatalog)
export const useResourceCatalog = () => useContext(ResourceCatalogContext)
