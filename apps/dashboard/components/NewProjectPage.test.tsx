import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { FIRST_PIN_POLL_MS, NewProjectPage, setupPrompt } from './NewProjectPage'
import { route } from '../lib/routes'

type Props = ComponentProps<typeof NewProjectPage>
const available = (key: string) => Promise.resolve({ key, available: true, suggestion: '' })
let props: Props
const page = (overrides: Partial<Props> = {}) => <NewProjectPage {...props} {...overrides} />
const copy = () => act(async () => fireEvent.click(screen.getByRole('button', { name: /^(Copy prompt|Copied)$/ })))
const settle = () => act(async () => { vi.advanceTimersByTime(400) })
const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Project name'), { target: { value } })
let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  props = { apiBase: '/api', checkAvailability: vi.fn(available), onCreate: vi.fn().mockResolvedValue(true), onOpenProject: vi.fn() }
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('NewProjectPage', () => {
  it('bakes the project ID into one prompt and creates the project on copy', async () => {
    render(page())
    expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeDisabled()
    typeName('Acme Marketing')
    expect(screen.getByText(/checking…/)).toBeInTheDocument()
    await settle()
    expect(props.checkAvailability).toHaveBeenCalledWith('acme-marketing')
    await copy()
    expect(writeText).toHaveBeenCalledWith(setupPrompt('acme-marketing'))
    expect(props.onCreate).toHaveBeenCalledWith('acme-marketing', 'Acme Marketing')
    expect(screen.getByText(/created, it’s in your sidebar/)).toBeInTheDocument()
    expect(screen.getByText(/Waiting for the first pin on/)).toBeInTheDocument()

    // The project is locked once created: copying again creates nothing new.
    expect(screen.getByLabelText('Project name')).toHaveAttribute('readonly')
    expect(screen.queryByText(/Renaming/)).toBeNull()
    await copy()
    expect(props.onCreate).toHaveBeenCalledOnce()
  })

  it('ignores a second copy while the first create is in flight', async () => {
    let finish!: (ok: boolean) => void
    props.onCreate = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    render(page())
    typeName('Acme')
    await settle()
    await copy()
    await copy()
    expect(props.onCreate).toHaveBeenCalledOnce()
    await act(async () => finish(false))
    expect(screen.queryByText(/created/)).toBeNull()
  })

  it('warns that the copied prompt won’t work when creating fails, and checks the ID again', async () => {
    props.onCreate = vi.fn().mockResolvedValue(false)
    // A stale error from an earlier attempt isn't shown before this page tries anything.
    const view = render(page({ error: 'Name already used' }))
    expect(screen.queryByRole('alert')).toBeNull()
    typeName('Acme')
    await settle()
    // Someone else took the ID between the check and the copy.
    vi.mocked(props.checkAvailability).mockResolvedValue({ key: 'acme', available: false, suggestion: 'acme-2' })
    await copy()
    expect(screen.queryByText(/Waiting for the first pin/)).toBeNull()
    expect(screen.getByLabelText('Project name')).toHaveValue('Acme')
    expect(screen.getByLabelText('Project name')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('alert')).toHaveTextContent('Name already used The prompt you copied uses acme, which doesn’t exist yet')
    await settle()
    expect(props.checkAvailability).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: /^(Copy prompt|Copied)$/ })).toBeDisabled()

    // Moving to another ID clears the warning; a failure without a message still explains itself.
    fireEvent.click(screen.getByRole('button', { name: 'Use acme-2' }))
    expect(screen.queryByRole('alert')).toBeNull()
    vi.mocked(props.checkAvailability).mockImplementation(available)
    await settle()
    view.rerender(page({ error: null }))
    await copy()
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t create this project. The prompt you copied uses acme-2')
  })

  it('offers the server suggestion when the ID is taken', async () => {
    props.checkAvailability = vi.fn((key: string) => Promise.resolve(key === 'acme' ? { key, available: false, suggestion: 'acme-2' } : { key, available: true, suggestion: '' }))
    render(page())
    typeName('Acme')
    await settle()
    expect(screen.getByLabelText('Project name')).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Use acme-2' }))
    await settle()
    expect(screen.getAllByText('acme-2').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeEnabled()
  })

  it('explains taken IDs without a suggestion, invalid IDs and failed checks', async () => {
    props.checkAvailability = vi.fn((key: string) => key === 'down' ? Promise.reject(new Error('offline')) : Promise.resolve({ key, available: false, suggestion: '' }))
    render(page())
    typeName('Acme')
    await settle()
    expect(screen.getByText(/taken\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    typeName('x'.repeat(64))
    expect(screen.getByText(/use lowercase letters/)).toBeInTheDocument()
    typeName('down')
    await settle()
    expect(screen.queryByText(/checking…|taken/)).toBeNull()
    // A failed check says so and can be retried without editing the name.
    expect(screen.getByText(/couldn’t check if it’s free/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeDisabled()
    vi.mocked(props.checkAvailability).mockImplementation(available)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await settle()
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeEnabled()
    typeName('')
    expect(screen.getAllByText('your-project').length).toBeGreaterThan(0)
  })

  it('drops availability answers for an ID the user already changed', async () => {
    const answers: Array<(value: { key: string; available: boolean; suggestion: string }) => void> = []
    const failures: Array<(error: Error) => void> = []
    props.checkAvailability = vi.fn(() => new Promise<{ key: string; available: boolean; suggestion: string }>((resolve, reject) => { answers.push(resolve); failures.push(reject) }))
    render(page())
    typeName('Old')
    await settle()
    typeName('New')
    await settle()
    typeName('Newer')
    await settle()
    // A late answer for "old" and a late failure for "new" both arrive after the user moved on.
    await act(async () => { answers[0]({ key: 'old', available: true, suggestion: '' }); failures[1](new Error('late')) })
    expect(screen.getByText(/checking…/)).toBeInTheDocument()
  })

  it('connects through MCP and asks the agent with the same ID', async () => {
    render(page({ apiBase: 'https://crrt.ai/api/' }))
    typeName('Acme')
    await settle()
    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))
    expect(screen.getByText('claude mcp add --transport http --scope user crrt https://crrt.ai/api/mcp/v1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'MCP connections' })).toHaveAttribute('href', route('/mcp-auth'))
    await copy()
    expect(writeText).toHaveBeenCalledWith('Set up CRRT here as project acme.')
    expect(props.onCreate).toHaveBeenCalledWith('acme', 'Acme')
  })

  it('looks for the first pin while waiting, only while the tab is visible', async () => {
    const onCheckFirstPin = vi.fn()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const view = render(page({ onCheckFirstPin }))
    typeName('Acme')
    await settle()
    act(() => { vi.advanceTimersByTime(FIRST_PIN_POLL_MS) })
    expect(onCheckFirstPin).not.toHaveBeenCalled()
    await copy()
    act(() => { vi.advanceTimersByTime(FIRST_PIN_POLL_MS) })
    expect(onCheckFirstPin).toHaveBeenCalledOnce()
    visibility.mockReturnValue('hidden')
    act(() => { vi.advanceTimersByTime(FIRST_PIN_POLL_MS) })
    expect(onCheckFirstPin).toHaveBeenCalledOnce()
    visibility.mockReturnValue('visible')
    view.rerender(page({ onCheckFirstPin, firstPin: true }))
    act(() => { vi.advanceTimersByTime(FIRST_PIN_POLL_MS * 3) })
    expect(onCheckFirstPin).toHaveBeenCalledOnce()
    visibility.mockRestore()
  })

  it('celebrates the first pin and opens the project', async () => {
    const view = render(page())
    typeName('Acme')
    await settle()
    await copy()
    view.rerender(page({ firstPin: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Open the project →' }))
    expect(props.onOpenProject).toHaveBeenCalledOnce()
  })

  it('welcomes a first project with team suggestions, and keeps the welcome after creating it', async () => {
    const view = render(page({ first: true, suggestedProjects: <p>Team project</p> }))
    expect(screen.getByRole('heading', { name: 'Create your first project' })).toBeInTheDocument()
    expect(screen.getByText('Team project')).toBeInTheDocument()
    view.rerender(page({ first: false, suggestedProjects: <p>Team project</p> }))
    expect(screen.getByRole('heading', { name: 'Create your first project' })).toBeInTheDocument()
  })

  it('sends accounts without a plan to Billing instead of the form', () => {
    render(page({ planRequired: { label: 'Start free trial' } }))
    expect(screen.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', route('/billing'))
    expect(screen.queryByLabelText('Project name')).toBeNull()
  })
})
