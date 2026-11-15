import type { Meta, StoryObj } from '@storybook/react-vite'
import { Title, Primary, Controls, Stories } from '@storybook/addon-docs/blocks'
import { fn, expect } from 'storybook/test'
import { Video, ArrowRight } from 'lucide-react'
import { Button } from '../src/design-system/components/button'
import { buttonMeta } from '../src/design-system/components/button.meta'
import { FeedbackWidgetStyles } from '../src/components/FeedbackWidget/styles'

function ButtonDocs() {
  return <div data-theme="light"><Title /><Primary />
    <section aria-label="Component documentation"><h2>What it does</h2><p>{buttonMeta.description}</p>
      <h3>When to use</h3><ul>{buttonMeta.whenToUse.map(text => <li key={text}>{text}</li>)}</ul>
      <h3>When to avoid</h3><ul>{buttonMeta.whenNotToUse.map(text => <li key={text}>{text}</li>)}</ul>
      <h3>Accessibility and interaction</h3><ul>{buttonMeta.accessibility.map(text => <li key={text}>{text}</li>)}</ul>
      <h3>Widget usage</h3><p>Record and Cancel use secondary small buttons. Send uses a primary small button. The widget injects the same button stylesheet that this Storybook uses, with its own isolated surface tokens.</p>
      <h3>Design tokens</h3><p>{buttonMeta.tokens.map(token => <code key={token} style={{ marginRight: 8 }}>{token}</code>)}</p>
      <h3>Usage examples</h3>{buttonMeta.examples.map(code => <pre key={code}><code>{code}</code></pre>)}
    </section><Controls /><Stories includePrimary={false} /></div>
}
const meta = {
  title: 'Shared/Button', component: Button, tags: ['autodocs'],
  args: { children: 'Start review', onClick: fn() },
  argTypes: {
    tone: { control: 'select', options: ['primary', 'secondary', 'quiet'], description: 'Semantic emphasis of the action.', table: { defaultValue: { summary: 'primary' } } },
    size: { control: 'select', options: ['sm', 'md', 'lg'], description: 'Small: 34px; medium: 40px; large: 50px minimum height.', table: { defaultValue: { summary: 'md' } } },
    disabled: { control: 'boolean', description: 'Prevents activation while the action is unavailable.' },
  },
  parameters: { docs: { page: ButtonDocs, story: { inline: false, height: 260 } } },
} satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Secondary: Story = { args: { tone: 'secondary' } }
export const Quiet: Story = { args: { tone: 'quiet' } }
export const Small: Story = { args: { size: 'sm' } }
export const Large: Story = { args: { size: 'lg' } }
export const Disabled: Story = { args: { disabled: true } }
export const WidgetActions: Story = {
  render: args => <><FeedbackWidgetStyles /><div data-fw-crrt style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 16, background: 'var(--fw-surface)', width: 'fit-content' }}>
    <Button tone="secondary" size="sm" onClick={args.onClick}><Video size={13} />Record</Button>
    <Button tone="secondary" size="sm" onClick={args.onClick}>Cancel</Button>
    <Button tone="primary" size="sm" disabled={args.disabled} onClick={args.onClick}>Send<ArrowRight size={12} /></Button>
  </div></>,
  play: async ({ canvas, userEvent, args }) => { await userEvent.click(canvas.getByRole('button', { name: 'Send' })); await expect(args.onClick).toHaveBeenCalled() },
}
export const WidgetDisabled: Story = { ...WidgetActions, args: { disabled: true }, play: async ({ canvas }) => { await expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled() } }
