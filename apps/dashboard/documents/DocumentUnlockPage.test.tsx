// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { DocumentUnlockPage } from './DocumentUnlockPage'
vi.mock('../components/LoginPage',()=>({LoginPage:({continuationPath}:{continuationPath:string})=><div>Login {continuationPath}</div>}))
const fetcher=vi.fn(),requestId='11111111-1111-4111-8111-111111111111',proof='a'.repeat(43)
const approval={clientName:'My agent',shareKey:requestId,status:'pending'}
const response=(data:object,ok=true)=>Promise.resolve({ok,json:async()=>data})
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);window.history.replaceState({},'','/dashboard/document-unlock#'+new URLSearchParams({requestId,proof}))})
afterEach(()=>vi.unstubAllGlobals())
it('keeps the browser proof through login without exposing a password in the URL',()=>{
  render(<DocumentUnlockPage apiBase="/api" accessToken={null}/>);expect(screen.getByText(/Login/)).toHaveTextContent('proof='+proof);expect(fetcher).not.toHaveBeenCalled()
})
it('inspects the client, recovers an incorrect password, and confirms approval without displaying the grant',async()=>{
  fetcher.mockImplementationOnce(()=>response(approval));render(<DocumentUnlockPage apiBase="/api" accessToken="session"/>);expect(screen.getByRole('status')).toBeInTheDocument();await screen.findByLabelText('Document password');expect(screen.getByText('My agent')).toBeInTheDocument();expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({requestId,proof,action:'inspect'})
  fetcher.mockImplementationOnce(()=>response({error:'incorrect_password'},false));fireEvent.change(screen.getByLabelText('Document password'),{target:{value:'wrong'}});fireEvent.click(screen.getByText('Unlock for this connection'));await screen.findByText('That password did not work. Try again.')
  fetcher.mockImplementationOnce(()=>response({status:'approved'}));fireEvent.change(screen.getByLabelText('Document password'),{target:{value:'correct'}});fireEvent.click(screen.getByText('Unlock for this connection'));await screen.findByText('Document unlocked');expect(screen.queryByLabelText('Document password')).not.toBeInTheDocument();expect(window.location.hash).not.toContain('correct');expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({requestId,proof,action:'approve',password:'correct'})
})
it.each(['connection_unavailable','unlock_request_expired','unlock_request_changed','other'])('shows a recoverable %s inspection error',async code=>{
  fetcher.mockImplementationOnce(()=>response({error:code},false));render(<DocumentUnlockPage apiBase="/api" accessToken="session"/>);await screen.findByRole('alert');fetcher.mockImplementationOnce(()=>response({...approval,status:'approved'}));fireEvent.click(screen.getByText('Try again'));await screen.findByText('Document unlocked')
})
it('rejects incomplete links and handles offline inspection',async()=>{
  window.history.replaceState({},'','/dashboard/document-unlock');const missing=render(<DocumentUnlockPage apiBase="/api" accessToken="session"/>);await screen.findByText(/link is incomplete/);expect(fetcher).not.toHaveBeenCalled();missing.unmount();window.history.replaceState({},'','/dashboard/document-unlock#'+new URLSearchParams({requestId,proof}));fetcher.mockRejectedValueOnce(new Error('Offline'));render(<DocumentUnlockPage apiBase="/api" accessToken="session"/>);await screen.findByText(/Could not connect/)
})
it.each(['success','failure'])('ignores inspection %s after leaving the page',async outcome=>{
  let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;fetcher.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;reject=b}));const view=render(<DocumentUnlockPage apiBase="/api" accessToken="session"/>);view.unmount();await act(async()=>{if(outcome==='failure')reject(new Error('Offline'));else resolve({ok:true,json:async()=>approval})})
})
it.each(['success','failure','unmount-success','unmount-failure'])('ignores approval %s from a previous browser session',async outcome=>{
  fetcher.mockImplementationOnce(()=>response(approval));const view=render(<DocumentUnlockPage apiBase="/api" accessToken="old"/>);await screen.findByLabelText('Document password');let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;fetcher.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;reject=b}));fireEvent.change(screen.getByLabelText('Document password'),{target:{value:'private'}});fireEvent.click(screen.getByText('Unlock for this connection'))
  if(outcome.startsWith('unmount'))view.unmount();else{fetcher.mockImplementationOnce(()=>response(approval));view.rerender(<DocumentUnlockPage apiBase="/api" accessToken="new"/>);await waitFor(()=>expect(screen.getByLabelText('Document password')).toHaveValue(''))}
  await act(async()=>{if(outcome.endsWith('failure'))reject(new Error('Old failure'));else resolve({ok:true,json:async()=>({status:'approved'})})});expect(screen.queryByText('Document unlocked')).not.toBeInTheDocument()
})

async function changeTicket() {
  const next = { requestId: '22222222-2222-4222-8222-222222222222', proof: 'b'.repeat(43) }
  await act(async () => {
    window.history.replaceState({}, '', '/dashboard/document-unlock#' + new URLSearchParams(next))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  return next
}
it('replaces an approved ticket when a new unlock link reuses the tab', async () => {
  fetcher.mockImplementationOnce(() => response({ ...approval, status: 'approved' }))
  render(<DocumentUnlockPage apiBase="/api" accessToken="session" />)
  await screen.findByText('Document unlocked')
  fetcher.mockImplementationOnce(() => response({ ...approval, clientName: 'Next agent' }))
  const next = await changeTicket()
  await screen.findByLabelText('Document password')
  expect(screen.queryByText('Document unlocked')).not.toBeInTheDocument()
  expect(screen.getByText('Next agent')).toBeInTheDocument()
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ ...next, action: 'inspect' })
  fetcher.mockImplementationOnce(() => response({ status: 'approved' }))
  fireEvent.change(screen.getByLabelText('Document password'), { target: { value: 'new password' } })
  fireEvent.click(screen.getByText('Unlock for this connection'))
  await screen.findByText('Document unlocked')
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ ...next, action: 'approve', password: 'new password' })
})
it.each(['inspect-success', 'inspect-failure', 'approve-success', 'approve-failure'])('ignores old ticket %s after fragment navigation', async outcome => {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void
  const pending = () => new Promise((a, b) => { resolve = a; reject = b })
  fetcher.mockImplementationOnce(outcome.startsWith('inspect') ? pending : () => response(approval))
  render(<DocumentUnlockPage apiBase="/api" accessToken="session" />)
  if (outcome.startsWith('approve')) {
    await screen.findByLabelText('Document password')
    fetcher.mockImplementationOnce(pending)
    fireEvent.change(screen.getByLabelText('Document password'), { target: { value: 'old secret' } })
    fireEvent.click(screen.getByText('Unlock for this connection'))
  }
  fetcher.mockImplementationOnce(() => response({ ...approval, clientName: 'Next agent' }))
  await changeTicket()
  await screen.findByText('Next agent')
  await act(async () => {
    if (outcome.endsWith('failure')) reject(new Error('Old ticket failure'))
    else resolve({ ok: true, json: async () => ({ ...approval, status: 'approved' }) })
  })
  expect(screen.getByLabelText('Document password')).toHaveValue('')
  expect(screen.getByText('Unlock for this connection')).toBeEnabled()
  expect(screen.queryByText('Document unlocked')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
