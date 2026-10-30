import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CTAGroup, DemoFrame, IconButton, NavLink } from '.'

afterEach(cleanup)
it('composes a labelled demo with keyboard-accessible navigation and controls', () => {
  const onClick = vi.fn()
  render(<DemoFrame title="Feedback preview" status="Ready" controls={<IconButton label="Replay" onClick={onClick}>↻</IconButton>}><CTAGroup><NavLink href="/docs">Read documentation</NavLink></CTAGroup></DemoFrame>)
  expect(screen.getByText('Feedback preview')).toBeInTheDocument()
  expect(screen.getByText('Ready')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Read documentation' })).toHaveAttribute('href', '/docs')
  fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
  expect(onClick).toHaveBeenCalledOnce()
})
