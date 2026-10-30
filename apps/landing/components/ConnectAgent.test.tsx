import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ConnectAgent } from './ConnectAgent'
it('copies onboarding instructions and explains what to do next', async () => {
 const write = vi.fn().mockResolvedValue(undefined)
 Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText:write} })
 render(<ConnectAgent />)
 fireEvent.click(screen.getByRole('button', {name:'Copy CRRT agent setup prompt'}))
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Paste it into'))
 expect(write).toHaveBeenCalledWith(expect.stringContaining('https://crrt.ai/get-started.md'))
 expect(screen.getByText('Prompt copied')).toBeInTheDocument()
})
it('exposes selectable instructions when clipboard access fails', async () => {
 Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}})
 render(<ConnectAgent />)
 fireEvent.click(screen.getByRole('button', {name:'Copy CRRT agent setup prompt'}))
 const summary = await screen.findByText('Could not copy. Select the setup prompt below.')
 expect(summary.closest('details')).toHaveAttribute('open')
})
