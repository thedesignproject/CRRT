import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { apiBase, project } from '../../../.storybook/msw-handlers'
import { ProjectPrivacy } from './ProjectPrivacy'

const meta = {
  component: ProjectPrivacy,
  tags: ['ai-generated'],
  args: { project, apiBase, accessToken: 'storybook-fixture', canEdit: true, onSaved: fn() },
} satisfies Meta<typeof ProjectPrivacy>

export default meta
type Story = StoryObj<typeof meta>

export const Public: Story = {}
export const Private: Story = { args: { project: { ...project, widgetPrivate: true, feedbackAccess: 'admins' } } }
export const ReadOnly: Story = { args: { canEdit: false, project: { ...project, widgetPrivate: true } } }
export const SavePrivacy: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Private project' }))
    await userEvent.selectOptions(canvas.getByRole('combobox'), 'admins')
    await userEvent.click(canvas.getByRole('button', { name: 'Save privacy' }))
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce())
    await expect(canvas.getByRole('checkbox')).toBeChecked()
    await expect(canvas.getByRole('combobox')).toHaveValue('admins')
  },
}
