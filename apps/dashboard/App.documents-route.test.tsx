import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const auth=vi.hoisted(()=>({email:undefined as string|undefined}))
vi.mock('./hooks/useAuth',()=>({useAuth:()=>({session:{access_token:'s'},user:{id:'u',email:auth.email},loading:false,signOut:vi.fn()})}))
vi.mock('./lib/supabase',()=>({supabase:{}}))
vi.mock('./documents/DocumentsPage',()=>({DocumentsPage:({author}:{author:string})=><div>Documents for {author}</div>}))
vi.mock('./components/ProductAuditPage',()=>({ProductAuditPage:()=><div>Audit page</div>}))
import { App } from './App'
import { route } from './lib/routes'
it('routes authenticated users to documents with safe author attribution',()=>{
  window.history.replaceState({},'',route('/documents'));const view=render(<App/>);expect(screen.getByText('Documents for Project member')).toBeInTheDocument();view.unmount()
  auth.email='reviewer@test.local';render(<App/>);expect(screen.getByText('Documents for reviewer@test.local')).toBeInTheDocument()
})
it('preserves existing authenticated routes',()=>{
  window.history.replaceState({},'',route('/audits/11111111-1111-4111-8111-111111111111'));render(<App/>);expect(screen.getByText('Audit page')).toBeInTheDocument()
})
