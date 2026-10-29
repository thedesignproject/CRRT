import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { McpSetup } from './McpSetup'

afterEach(() => vi.restoreAllMocks())

it('copies one setup prompt with the guide, actual endpoint, and continuation boundary', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } })
  render(<McpSetup apiBase="http://127.0.0.1:3001/api/" />)
  expect(screen.queryByRole('group', { name: 'Choose your MCP client' })).toBeNull()
  expect(screen.getByText(/Paste this prompt into Codex, Claude Code, Cursor/)).toBeInTheDocument()
  const names = ['setup prompt', 'server URL', 'example prompt']
  for (const [index, name] of names.entries()) {
    fireEvent.click(screen.getByRole('button', { name: `Copy ${name}` }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(index + 1))
  }
  expect(write.mock.calls[0][0]).toBe(`Set up CRRT for this agent. Fetch ${window.location.origin}/get-started.md and follow its instructions. Use this MCP server URL: http://127.0.0.1:3001/api/mcp/v1. After setup, continue any existing user-requested task that needed CRRT once its tools are available. If the client requires a reload, preserve the task and explain how to resume it after reloading, without repeating successful setup or login. If there is no existing task, confirm readiness once verified and wait for instructions.`)
  expect(write.mock.calls[1][0]).toBe('http://127.0.0.1:3001/api/mcp/v1')
  expect(write.mock.calls[2][0]).toContain('Ready for Agent')
  expect(screen.getByText(/Sign in with your CRRT account/)).toBeInTheDocument()
  expect(screen.getByText(/explicit request and current project permissions/)).toBeInTheDocument()
  expect(await screen.findAllByText('Copied')).toHaveLength(3)
})

it('preserves selectable text on copy failure and supports relative API URLs', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  render(<McpSetup apiBase="/api" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy setup prompt' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Select and copy the prompt below')
  expect(screen.getByText(/Set up CRRT for this agent/)).toHaveTextContent(`Use this MCP server URL: ${window.location.origin}/api/mcp/v1`)
})

it('keeps the complete prompt available behind the compact onboarding action', () => {
  render(<McpSetup apiBase="/api" />)
  expect(screen.getByText('Onboard your agent')).toBeVisible()
  const prompt = screen.getByText(/Set up CRRT for this agent/)
  expect(prompt.closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('View prompt'))
  expect(screen.getByText('View prompt')).toBeInTheDocument()
})

it('keeps the server address selectable when clipboard access fails', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  render(<McpSetup apiBase="/api" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy server URL' }))
  expect(await screen.findByText('Could not copy. Select and copy the text above.')).toBeVisible()
})
