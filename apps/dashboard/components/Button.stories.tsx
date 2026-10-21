import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { Button } from './Button'
import { route } from '../lib/routes'

const meta = {
  component: Button,
  tags: ['ai-generated'],
  args: { children: 'Create project', onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Create project' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

export const Secondary: Story = { args: { variant: 'secondary', children: 'Cancel' } }

export const DisabledLink: Story = {
  args: { variant: 'link', href: route('/billing'), disabled: true, children: 'Billing' },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Billing' })
    await expect(link).toHaveAttribute('aria-disabled', 'true')
    await expect(link).not.toHaveAttribute('href')
  },
}

export const CssCheck: Story = {
  globals: { theme: 'light' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Create project' })
    // bg-primary resolves to --crrt-dashboard-orange (#c24c12) in light mode.
    await waitFor(() => expect(getComputedStyle(button).backgroundColor).toBe('rgb(194, 76, 18)'))
    // size=sm uses h-7 (28px), proving Tailwind utilities were generated too.
    await expect(getComputedStyle(button).height).toBe('28px')
  },
}
