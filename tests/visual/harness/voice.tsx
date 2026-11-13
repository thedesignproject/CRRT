import { VoiceCommentPrototype } from '../../../apps/landing/voice-prototype/VoiceCommentPrototype'

export function VoiceHarness() {
  return <>
    <main style={{ padding: 40, maxWidth: 800 }}>
      <h1 id="voice-target">A page worth reviewing</h1>
      <p>Select the heading to leave a voice comment.</p>
    </main>
    <VoiceCommentPrototype />
  </>
}
