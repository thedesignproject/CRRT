import {cleanup,render,screen,waitFor}from'@testing-library/react'
import {afterEach,expect,it,vi}from'vitest'
const rendered=vi.hoisted(()=>vi.fn())
const sendMessage=vi.hoisted(()=>vi.fn())
vi.mock('../../../src/components/FeedbackWidget',()=>({FeedbackWidget:(props:unknown)=>{rendered(props);return <div>Widget</div>}}))
vi.mock('wxt/browser',()=>({browser:{storage:{onChanged:{addListener:vi.fn(),removeListener:vi.fn()}},runtime:{sendMessage}}}))
vi.mock('./comments-api',()=>({extensionSession:vi.fn(),listExtensionProjects:vi.fn(),createPageComment:vi.fn(),deletePageComment:vi.fn(),getExternalWorkDraft:vi.fn(),listPageComments:vi.fn(),listProjectComments:vi.fn(),sendExternalWork:vi.fn(),updatePageComment:vi.fn()}))
import {extensionSession,listExtensionProjects}from'./comments-api'
import {localComments}from'./local-feedback'
import {ExtensionWidget}from'./personal-widget'
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('mounts the real local adapter when no account is present, with no collaboration or tracker surface',async()=>{
 vi.mocked(extensionSession).mockResolvedValue(null)
 render(<ExtensionWidget activate={false} page={{url:'https://example.com',width:100,height:100,scrollX:0,scrollY:0}as never} />)
 await screen.findByText('Widget')
 expect(rendered).toHaveBeenLastCalledWith(expect.objectContaining({personalComments:localComments,projectId:''}))
 expect(localComments.externalWork).toBeUndefined();expect(localComments.beforeOpen).toBeUndefined()
 expect(listExtensionProjects).not.toHaveBeenCalled()
})
it('keeps local mode independent of a failed account lookup',async()=>{
 vi.mocked(extensionSession).mockRejectedValue(new Error('Cloud unavailable'))
 render(<ExtensionWidget activate={false} />)
 await waitFor(()=>expect(rendered).toHaveBeenCalledWith(expect.objectContaining({personalComments:localComments})))
 expect(listExtensionProjects).not.toHaveBeenCalled()
})
it('hands Record launch to the extension background and reports failures',async()=>{
 vi.mocked(extensionSession).mockResolvedValue(null)
 sendMessage.mockResolvedValueOnce({ok:true})
 render(<ExtensionWidget activate={false} />)
 await waitFor(()=>expect(rendered).toHaveBeenCalled())
 const onRecord=(rendered.mock.lastCall?.[0] as {onRecord:()=>Promise<void>}).onRecord
 await expect(onRecord()).resolves.toBeUndefined()
 expect(sendMessage).toHaveBeenCalledWith({type:'record:open'})
 sendMessage.mockResolvedValueOnce({ok:false,error:'blocked'})
 await expect(onRecord()).rejects.toThrow('blocked')
 sendMessage.mockResolvedValueOnce(undefined)
 await expect(onRecord()).rejects.toThrow('Could not open CRRT Record')
})
