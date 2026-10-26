import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { AgentLauncher } from './AgentLauncher'

const meta = {
  component: AgentLauncher,
  tags: ['ai-generated'],
  args: { readyCount: 3, open: false, onOpen: fn() },
} satisfies Meta<typeof AgentLauncher>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole('button', { name: 'Agents, 3 ready' })
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    await expect(args.onOpen).toHaveBeenCalledOnce()
  },
}
export const Empty: Story = { args: { readyCount: 0 } }
export const Open: Story = { args: { open: true } }
export const Unavailable: Story = {
  args: { disabled: true, onOpen: undefined, unavailableReason: 'Select a project to use agents.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Agents unavailable/ })).toBeDisabled()
  },
}
