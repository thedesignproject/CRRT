import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { route } from './lib/routes'
const auth=vi.hoisted(()=>({session:null as null|{access_token:string},user:null as null|{id:string;email:string},loading:true,signOut:vi.fn()}))
vi.mock('./hooks/useAuth',()=>({useAuth:()=>auth}))
vi.mock('./lib/supabase',()=>({supabase:{}}))
vi.mock('./documents/DocumentReader',()=>({ DocumentReader:({shareKey,authorName}:{shareKey:string;authorName:string})=><div>Shared document {shareKey} {authorName}</div> }))
vi.mock('./documents/DocumentUnlockPage',()=>({DocumentUnlockPage:({accessToken}:{accessToken:string|null})=><div>Browser unlock {accessToken ?? 'login'}</div>}))
import { App } from './App'
it('opens document links before authentication finishes',()=>{
  window.history.replaceState({},'',route('/doc/11111111-1111-4111-8111-111111111111'))
  render(<App/>);expect(screen.getByText(/Shared document/)).toBeInTheDocument()
})
it('passes the signed-in identity through the shared document route',()=>{
  auth.session={access_token:'session'};auth.user={id:'owner',email:'owner@local.test'}
  window.history.replaceState({},'',route('/doc/11111111-1111-4111-8111-111111111111'))
  const view=render(<App/>);expect(screen.getByText(/Shared document/)).toHaveTextContent('owner@local.test')
  view.unmount();auth.session=null;auth.user=null
})
it('keeps the regular authentication loading route',()=>{
  window.history.replaceState({},'',route('/'))
  const view=render(<App/>);expect(view.container.querySelector('.animate-spin')).toBeInTheDocument()
})

it.each([null,{access_token:'session'}])('routes browser document approval with the current session %s',session=>{
  auth.loading=false;auth.session=session;window.history.replaceState({},'',route('/document-unlock'));render(<App/>);expect(screen.getByText(/Browser unlock/)).toHaveTextContent(session?'session':'login');auth.loading=true;auth.session=null
})
