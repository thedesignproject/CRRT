import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme'
import { IconButton } from './button'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <IconButton label={`Switch to ${next} mode`} onClick={toggleTheme}>
      {theme === 'light' ? <Moon aria-hidden="true" size={17} /> : <Sun aria-hidden="true" size={17} />}
    </IconButton>
  )
}
