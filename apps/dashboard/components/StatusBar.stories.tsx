import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { StatusBar } from './StatusBar'

const meta = {
  component: StatusBar,
  tags: ['ai-generated'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StatusBar>

export default meta
type Story = StoryObj<typeof meta>

export const Project: Story = {}
export const WithoutAgents: Story = { args: { agentAvailable: false } }
export const PersonalInbox: Story = {
  args: { personal: true },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('ready')).not.toBeInTheDocument()
    await expect(canvas.queryByText('sidebar')).not.toBeInTheDocument()
    await expect(canvas.getByText('Space')).toBeVisible()
  },
}
