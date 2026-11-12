// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DocumentRecoveryProvider, useDocumentRecovery } from './DocumentRecovery'

it('keeps account drafts isolated when clearing recovery without a signed-in user', () => {
  const { result, rerender } = renderHook(({ userId }: { userId: string | null }) => useDocumentRecovery(userId), {
    initialProps: { userId: 'owner' as string | null },
    wrapper: DocumentRecoveryProvider,
  })
  act(() => result.current.update({ projectId: null, documentId: 'document', tab: 'Edit' }, { editor: { title: 'Draft', body: 'My unsaved text' } }))
  rerender({ userId: null })
  expect(result.current.read()).toBeUndefined()
  act(() => result.current.clear())
  rerender({ userId: 'another-account' })
  expect(result.current.read()).toBeUndefined()
  rerender({ userId: 'owner' })
  expect(result.current.read()?.editor?.body).toBe('My unsaved text')
  act(() => result.current.clear())
  expect(result.current.read()).toBeUndefined()
})

it('updates the active list scope when the same document draft is saved in a different view',()=>{
  const {result}=renderHook(()=>useDocumentRecovery('owner'),{wrapper:DocumentRecoveryProvider})
  const location={projectId:null,documentId:'document',tab:'Edit' as const}
  act(()=>result.current.update({...location,listScope:'all'},{editor:{title:'Draft',body:'Unsaved'}}))
  expect(result.current.read()?.listScope).toBe('all')
  act(()=>result.current.update({...location,listScope:'mine'},{editor:{title:'Draft',body:'Still unsaved'}}))
  expect(result.current.read()?.listScope).toBe('mine')
  act(()=>result.current.update({...location,projectId:'project'},{editor:{title:'Draft',body:'Project view'}}))
  expect(result.current.read()?.listScope).toBeUndefined()
})
