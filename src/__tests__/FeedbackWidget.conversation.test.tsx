import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FeedbackWidget, type FeedbackConversationProps } from '../index'
import { FeedbackAuthor, FeedbackContent, FeedbackSendButton } from '../components/FeedbackWidget/FeedbackParts'
import { conversationComments, conversationSelector, conversationTarget, hostedComments, positionAt, positionedPoint, savedPosition } from '../components/FeedbackWidget/conversation'
import { feedbackField, nameField, openFeedbackList, openNote } from './conversationInteractions'

const conversation = (overrides: Partial<FeedbackConversationProps> = {}): FeedbackConversationProps => ({
  feedback: [], selection: '', onClearSelection: vi.fn(), onComment: vi.fn(async () => {}), errorMessage: () => 'Offline', ...overrides,
})
const note = { id: 'note', parentId: null, version: 1, author: 'Reviewer', body: 'A note', quote: 'Passage', createdAt: '2026-11-12T00:00:00Z', reviewStatus: 'open' as const, implementationStatus: 'unassigned' }
afterEach(() => vi.restoreAllMocks())

it('renders the real CRRT launcher and submits through the host with no project requests', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch'), submit = vi.fn(async () => {}), save = vi.spyOn(Storage.prototype, 'setItem')
  const view = render(<FeedbackWidget projectId="host-owned" conversation={conversation({ authorName: 'Signed in', onComment: submit })} />)
  expect(screen.getByRole('button', { name: 'Open CRRT menu' })).toBeInTheDocument()
  expect(view.container.querySelector('.fw-conversation')).toBeNull()
  fireEvent.change(feedbackField(), { target: { value: 'Host-owned feedback' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add feedback' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ body: 'Host-owned feedback', author: 'Signed in' })))
  expect(fetcher).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Host-owned feedback'))
})

it('keeps the submitted snapshot and ignores synchronous duplicate sends', async () => {
  let finish!: () => void
  const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  render(<FeedbackWidget projectId="host" conversation={conversation({ authorName: 'Owner', onComment: submit })} />)
  const field = feedbackField(); fireEvent.change(field, { target: { value: 'One note' } })
  act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })) })
  expect(submit).toHaveBeenCalledTimes(1); expect(field).toBeDisabled()
  await act(async () => finish()); expect(screen.queryByLabelText('Leave feedback')).not.toBeInTheDocument()
})

it('uses the native identity dialog for anonymous feedback and keeps drafts in memory', async () => {
  const submit = vi.fn(async () => {}), save = vi.spyOn(Storage.prototype, 'setItem')
  render(<FeedbackWidget projectId="host" conversation={conversation({ onComment: submit })} />)
  fireEvent.change(nameField(), { target: { value: 'Guest' } }); fireEvent.change(feedbackField(), { target: { value: 'Guest note' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add feedback' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ author: 'Guest' })))
  expect(save).not.toHaveBeenCalledWith('crrt-author-name', 'Guest')
})

it('keeps view-only hosts in the native sidebar without a composer', () => {
  render(<FeedbackWidget projectId="host" conversation={conversation({ readOnly: true, feedback: [note] })} />)
  openFeedbackList(); expect(screen.getByText('View-only access')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'c' }); expect(screen.queryByLabelText('Leave feedback')).not.toBeInTheDocument()
})

it('restores durable target positions and preserves a failed draft through access loss', async () => {
  const target = { selector: '#removed-after-publication', x: 10, y: 20, elementX: .25, elementY: .5 }, draft = vi.fn(), discard = vi.fn()
  const props = conversation({ authorName: 'Owner', initialDraft: { body: 'Recovered', author: 'Owner', reply: null, target }, onDraftChange: draft, onDiscard: discard, onComment: vi.fn(async () => { throw Error('Offline') }) })
  const view = render(<FeedbackWidget projectId="host" conversation={props} />)
  expect(screen.getByLabelText('Leave feedback')).toHaveValue('Recovered')
  expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({ target }))
  fireEvent.click(screen.getByRole('button', { name: 'Add feedback' })); await screen.findByRole('alert')
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.getByLabelText('Leave feedback')).toHaveValue('Recovered')
  view.rerender(<FeedbackWidget projectId="host" conversation={{ ...props, readOnly: true, concealed: true }} />)
  expect(screen.getByLabelText('Leave feedback')).toHaveProperty('readOnly', true)
  fireEvent.click(screen.getByRole('button', { name: 'Discard feedback' })); expect(discard).toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('resolves element-relative positions through layout changes and handles missing targets', () => {
  const element = document.createElement('p'); element.id = 'position-test'; document.body.append(element)
  let left = 100; element.getBoundingClientRect = () => ({ left, top: 50, width: 200, height: 100 } as DOMRect)
  const target = positionAt({ selector: '#position-test', x: 15, y: 10, url: 'https://local.test' }, 150, 80)
  expect(savedPosition(target)).toEqual({ selector: '#position-test', x: 15, y: 10, elementX: .25, elementY: .3 })
  expect(positionedPoint(target)).toEqual({ fixedX: 150, fixedY: 80 }); left = 200
  expect(positionedPoint(target)).toEqual({ fixedX: 250, fixedY: 80 })
  expect(savedPosition({ ...target, elementX: undefined })).toBeUndefined()
  expect(positionedPoint({ ...target, elementX: undefined })).toBeNull()
  expect(positionedPoint({ ...target, selector: '#missing' })).toBeNull()
  expect(positionAt({ ...target, selector: '#position-test' }, -100, 1000)).toMatchObject({ elementX: 0, elementY: 1 })
  element.getBoundingClientRect = () => ({ left, top: 50, width: 0, height: 0 } as DOMRect)
  expect(positionAt(target, 1, 1)).toMatchObject({ elementX: .5, elementY: .5 }); element.remove()
})

it('builds legacy quote targets and host-supplied pin targets without exposing replies as root pins', () => {
  const root = document.createElement('div'); root.className = 'document-prose'; root.innerHTML = '<p>Passage</p>'; document.body.append(root)
  expect(conversationTarget('Passage', '.document-prose').anchor?.selectedText).toBe('Passage')
  expect(conversationTarget('', '.document-prose').selector).toBe('.document-prose')
  const target = { selector: '.document-prose', x: 20, y: 30, elementX: .5, elementY: .5 }
  expect(conversationComments(conversation({ feedback: [{ ...note, target }, { ...note, id: 'reply', parentId: 'note' }] }), 'host')).toHaveLength(1)
  expect(conversationComments(conversation({ feedback: [{ ...note, quote: '' }] }), 'host')[0].anchor).toBeNull()
  root.remove(); expect(conversationTarget('').selector).toBe('body')
})

it('retains the package author, quote and action presentation for reply details', () => {
  const view = render(<><FeedbackAuthor author="" resolved={false} /><FeedbackAuthor author=" " resolved /><FeedbackContent body="Body" quote="Quote" resolved={false} /><FeedbackContent body="Resolved" resolved /><FeedbackSendButton disabled>Disabled</FeedbackSendButton><FeedbackSendButton>Enabled</FeedbackSendButton></>)
  expect(screen.getByText('U')).toBeInTheDocument(); expect(screen.getByText('“Quote”')).toBeInTheDocument()
  expect(view.container.querySelector('button')).toBeDisabled()
})

it('keeps the entire widget disabled when requested', () => {
  const view = render(<FeedbackWidget projectId="host" disabled conversation={conversation()} />)
  expect(view.container).toBeEmptyDOMElement()
})

it('blocks unsupported standard mutations for host-owned feedback instead of using project endpoints', async () => {
  expect(await hostedComments.list('https://local.test')).toEqual([])
  await expect(hostedComments.create({})).rejects.toThrow('Use the host mutation')
  await expect(hostedComments.update('note', 'Body')).rejects.toThrow('Use the host mutation')
  await expect(hostedComments.remove('note')).rejects.toThrow('Use the host mutation')
})

it('captures the actual click within host content and keeps a pending draft on native close gestures', async () => {
  const submit = vi.fn(async () => {})
  const view = render(<><button>Outside content</button><div className="capture-root"><p id="capture-point">A capture target.</p></div><FeedbackWidget projectId="host" conversation={conversation({ containerSelector: '.capture-root', authorName: 'Owner', onComment: submit })} /></>)
  const paragraph = screen.getByText('A capture target.')
  paragraph.getBoundingClientRect = () => ({ left: 100, top: 100, width: 400, height: 200, right: 500, bottom: 300 } as DOMRect)
  fireEvent.keyDown(document, { key: 'c' }); fireEvent.click(screen.getByText('Outside content'))
  expect(screen.queryByLabelText('Leave feedback')).not.toBeInTheDocument()
  fireEvent.click(paragraph, { clientX: 220, clientY: 160 })
  fireEvent.click(document.querySelector('[data-fw][style*="rgba(0, 0, 0, 0.05)"]')!)
  fireEvent.click(paragraph, { clientX: 220, clientY: 160 })
  const field = screen.getByLabelText('Leave feedback'); fireEvent.change(field, { target: { value: 'Precise point' } })
  fireEvent.click(document.querySelector('[data-fw][style*="rgba(0, 0, 0, 0.05)"]')!)
  expect(field).toHaveValue('Precise point')
  fireEvent.click(document.querySelector('button[title="Signed in as Owner"]')!)
  expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'A', shiftKey: true }); expect(screen.queryByText('Connect an agent')).not.toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'f' }); fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(field).toHaveValue('Precise point')
  fireEvent.click(screen.getByRole('button', { name: 'Add feedback' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ selector: '.capture-root > p:nth-of-type(1)', elementX: .3, elementY: .3 }) })))
  view.rerender(<><div className="capture-root"><p id="capture-point">A capture target.</p></div><FeedbackWidget projectId="host" conversation={conversation({ containerSelector: '.capture-root', authorName: 'Owner', feedback: [{ ...note, target: { selector: '#capture-point', x: 20, y: 20, elementX: .3, elementY: .3 } }] })} /></>)
  await waitFor(() => expect(document.querySelector('[data-fw-pin]')).toBeInTheDocument())
})

it.each(['.capture-root',undefined])('uses the native text-range selection in %s and stops capture when access changes', (containerSelector) => {
  const props = conversation({ containerSelector, authorName: 'Owner' })
  const view = render(<><div className="capture-root"><p id="text-point">Selected passage.</p></div><FeedbackWidget projectId="host" conversation={props} /></>)
  const paragraph = screen.getByText('Selected passage.'), range = document.createRange(); range.selectNodeContents(paragraph)
  Object.defineProperty(range, 'getClientRects', { value: () => [{ left: 100, top: 100, width: 100, height: 20 }] })
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => ({ left: 100, top: 100, width: 100, height: 20 }) })
  paragraph.getBoundingClientRect = () => ({ left: 100, top: 100, width: 100, height: 20 } as DOMRect)
  fireEvent.keyDown(document, { key: 'c' }); window.getSelection()!.addRange(range); fireEvent.click(paragraph)
  expect(screen.getByLabelText('Leave feedback')).toBeInTheDocument(); expect(screen.getByText('“Selected passage.”')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Discard feedback' })); window.getSelection()!.removeAllRanges()
  fireEvent.keyDown(document, { key: 'c' }); view.rerender(<><div className="capture-root"><p>Selected passage.</p></div><FeedbackWidget projectId="host" conversation={{ ...props, readOnly: true }} /></>)
  fireEvent.click(screen.getByText('Selected passage.')); expect(screen.queryByLabelText('Leave feedback')).not.toBeInTheDocument()
})

it('allows a host to capture the page when it does not restrict the content container', () => {
  render(<><p>Whole-page host content</p><FeedbackWidget projectId="host" conversation={conversation({ authorName: 'Owner' })} /></>)
  fireEvent.keyDown(document, { key: 'c' })
  fireEvent.click(screen.getByText('Whole-page host content'))
  expect(screen.getByLabelText('Leave feedback')).toBeInTheDocument()
})

it('keeps scoped selectors unique through nested document structure and different page wrappers',()=>{
  const root=document.createElement('div');root.className='selector-document';root.innerHTML='<p>same</p><blockquote><p>same</p></blockquote>';document.body.append(root)
  const target=root.querySelector('blockquote p')!,selector=conversationSelector(target,'.selector-document')
  expect(selector).toBe('.selector-document > blockquote:nth-of-type(1) > p:nth-of-type(1)');expect(document.querySelectorAll(selector)).toHaveLength(1)
  const wrapper=document.createElement('article');document.body.append(wrapper);wrapper.append(root);expect(document.querySelector(selector)).toBe(target)
  const captured={selector,x:10,y:20,url:window.location.href,elementX:.2,elementY:.3}
  expect(conversationTarget('same','.selector-document',captured)).toBe(captured)
  expect(conversationSelector(root,'.selector-document')).toBe('.selector-document')
  const outside=document.createElement('p');outside.id='outside-selector';document.body.append(outside);expect(conversationSelector(outside,'.selector-document')).toBe('#outside-selector')
  wrapper.remove();outside.remove()
})
