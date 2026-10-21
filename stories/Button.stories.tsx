import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronDown, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '../apps/dashboard/components/Button'

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'sm',
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'destructive', 'link'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    children: { control: 'text' },
    disabled: { control: 'boolean' },
    href: { control: 'text' },
    leftIcon: { control: false },
    rightIcon: { control: false },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/** Try every prop. Hover, press, and Tab onto the button to see the Hover, Pressed, and Focus states. */
export const Playground: Story = {}

/**
 * The main action, like "Create project". Use at most one per section or
 * dialog, and never place two Primary buttons next to each other.
 */
export const Primary: Story = {
  args: { children: 'Create project', leftIcon: <Plus /> },
}

/** Supporting actions, like "Copy key". Also the Cancel button in dialog footers. */
export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Copy key', leftIcon: <Copy /> },
}

/** Low-emphasis actions. Muted text with no fill until hovered. */
export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancel' },
}

/**
 * Irreversible or data-removing actions: delete, disconnect, remove. In a
 * dialog footer it takes the Primary's place.
 */
export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete', leftIcon: <Trash2 /> },
}

/** Text-only action with no padding. It ignores `size`. Pass `href` when it navigates. */
export const Link: Story = {
  args: { variant: 'link', children: 'View in dashboard', href: '#', rightIcon: <ExternalLink /> },
}

/** `sm` (28px) is the default. Dialog footers use `md` (32px). */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small · 28px</Button>
      <Button size="md">Medium · 32px</Button>
    </div>
  ),
}

/**
 * Icons sit beside the label and never replace it. They render at 14px and
 * are hidden from screen readers, so the label carries the meaning.
 */
export const WithIcons: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button leftIcon={<Plus />}>Create project</Button>
      <Button variant="secondary" rightIcon={<ChevronDown />}>Sort by</Button>
      <Button variant="link" href="#" rightIcon={<ExternalLink />}>Open docs</Button>
    </div>
  ),
}

/** Disabled buttons fade to 50% and ignore clicks. A disabled link loses its destination. */
export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button disabled>Create project</Button>
      <Button variant="secondary" disabled>Copy key</Button>
      <Button variant="destructive" disabled>Delete</Button>
      <Button variant="link" href="#" disabled>View in dashboard</Button>
    </div>
  ),
}

/**
 * Any variant can run an action or navigate. Omit `href` to run an action
 * (renders `<button>`); pass `href` to navigate (renders `<a>`). In the
 * dashboard, build paths with `route()`.
 */
export const ActionOrNavigation: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="secondary">Refresh</Button>
      <Button variant="secondary" href="#">Open settings</Button>
    </div>
  ),
}

/** Dialog footer from Figma: right-aligned, Secondary Cancel, then one Primary, both `md`. */
export const DialogFooter: Story = {
  render: () => (
    <div className="flex w-80 justify-end gap-2">
      <Button size="md" variant="secondary">Cancel</Button>
      <Button size="md">Create issue</Button>
    </div>
  ),
}

/** Destructive dialog footer from Figma: Destructive replaces the Primary. */
export const DestructiveDialogFooter: Story = {
  render: () => (
    <div className="flex w-80 justify-end gap-2">
      <Button size="md" variant="secondary">Cancel</Button>
      <Button size="md" variant="destructive">Delete 3</Button>
    </div>
  ),
}

// Counter-examples for the Usage page. Hidden from the sidebar and the Docs page.

export const DontTwoPrimaries: Story = {
  tags: ['!dev', '!autodocs'],
  render: () => (
    <div className="flex items-center gap-2">
      <Button>Save draft</Button>
      <Button>Publish</Button>
    </div>
  ),
}

export const DoPrimaryWithSecondary: Story = {
  tags: ['!dev', '!autodocs'],
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="secondary">Save draft</Button>
      <Button>Publish</Button>
    </div>
  ),
}

export const DontPrimaryForDelete: Story = {
  tags: ['!dev', '!autodocs'],
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="md" variant="secondary">Cancel</Button>
      <Button size="md" leftIcon={<Trash2 />}>Delete project</Button>
    </div>
  ),
}

export const DontIconOnly: Story = {
  tags: ['!dev', '!autodocs'],
  render: () => <Button variant="secondary" aria-label="Copy key" leftIcon={<Copy />}>{null}</Button>,
}
