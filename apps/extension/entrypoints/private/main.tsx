import { createRoot } from 'react-dom/client'
import { usePrivateFrame } from '../../lib/private-frame'
import { ExtensionWidget } from '../../lib/personal-widget'
export function PrivateFrame() {
  const { page, activate } = usePrivateFrame()
  return page && <ExtensionWidget activate={activate} page={page} />
}

createRoot(document.getElementById('root')!).render(<PrivateFrame />)
