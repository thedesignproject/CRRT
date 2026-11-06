import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { route } from './lib/routes'
const auth=vi.hoisted(()=>({session:null as null|{access_token:string},user:null,loading:true,signOut:vi.fn()}))
vi.mock('./hooks/useAuth',()=>({useAuth:()=>auth}))
vi.mock('./lib/supabase',()=>({supabase:{}}))
vi.mock('./documents/DocumentReader',()=>({ DocumentReader:({shareKey}:{shareKey:string})=><div>Shared document {shareKey}</div> }))
vi.mock('./documents/DocumentUnlockPage',()=>({DocumentUnlockPage:({accessToken}:{accessToken:string|null})=><div>Browser unlock {accessToken ?? 'login'}</div>}))
import { App } from './App'
it('opens document links before authentication finishes',()=>{
  window.history.replaceState({},'',route('/doc/11111111-1111-4111-8111-111111111111'))
  render(<App/>);expect(screen.getByText(/Shared document/)).toBeInTheDocument()
})
it('keeps the regular authentication loading route',()=>{
  window.history.replaceState({},'',route('/'))
  const view=render(<App/>);expect(view.container.querySelector('.animate-spin')).toBeInTheDocument()
})

it.each([null,{access_token:'session'}])('routes browser document approval with the current session %s',session=>{
  auth.loading=false;auth.session=session;window.history.replaceState({},'',route('/document-unlock'));render(<App/>);expect(screen.getByText(/Browser unlock/)).toHaveTextContent(session?'session':'login');auth.loading=true;auth.session=null
})
