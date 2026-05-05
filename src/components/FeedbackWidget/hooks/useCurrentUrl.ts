import { useEffect, useState } from 'react'

export function useCurrentUrl(): string {
  const [currentUrl, setCurrentUrl] = useState(() => window.location.href.split('#')[0]!)
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = window.location.href.split('#')[0]!
      setCurrentUrl((prev) => (prev === next ? prev : next))
    }, 300)
    return () => window.clearInterval(id)
  }, [])
  return currentUrl
}
