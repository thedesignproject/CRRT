import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { apiBase } from '../../../.storybook/msw-handlers'
import { BillingPage } from './BillingPage'

const meta = {
  component: BillingPage,
  tags: ['ai-generated'],
  parameters: { layout: 'fullscreen' },
  args: { apiBase, accessToken: 'storybook-fixture', email: 'designer@example.test' },
} satisfies Meta<typeof BillingPage>

export default meta
type Story = StoryObj<typeof meta>

export const Active: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Cloud active' })).toBeVisible()
    await expect(canvas.getByRole('progressbar', { name: 'Projects usage' })).toHaveAttribute('aria-valuenow', '2')
  },
}
export const SelfHosted: Story = {
  beforeEach: async ({ msw }) => {
    msw.use(http.get(`${apiBase}/v1/billing`, () => HttpResponse.json({ enabled: false })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Self-hosted CRRT remains free/)).toBeVisible()
  },
}
export const Unavailable: Story = {
  beforeEach: async ({ msw }) => {
    msw.use(http.get(`${apiBase}/v1/billing`, () => HttpResponse.json({ error: 'Unavailable' }, { status: 503 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Billing is temporarily unavailable.')
  },
}
