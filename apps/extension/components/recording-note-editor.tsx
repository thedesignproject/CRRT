import { useState } from 'react'
import { MAX_RECORDING_NOTE_LENGTH, type RecordingMark } from '../lib/recording'

export function RecordingNoteEditor({ marks, save }: { marks: RecordingMark[]; save: (marks: RecordingMark[]) => Promise<void> }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(marks.filter(mark => mark.text && mark.text.length > MAX_RECORDING_NOTE_LENGTH).map(mark => [mark.id, mark.text!])))
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  async function apply() {
    setSaving(true); setError('')
    try { await save(marks.map(mark => mark.id in drafts ? { ...mark, text: drafts[mark.id] } : mark)) }
    catch { setError('Could not save the edited notes. Your original recording is still available. Try again.') }
    finally { setSaving(false) }
  }
  return <section className="recording-note-repair" aria-label="Shorten oversized notes">
    <strong>Shorten these notes before uploading</strong>
    <p>Each note supports 2,000 characters. Your complete original text stays saved until you apply your edits. Your video stays intact.</p>
    {Object.entries(drafts).map(([id, text], index) => <label key={id}>Note {index + 1}<textarea disabled={saving} maxLength={MAX_RECORDING_NOTE_LENGTH} rows={6} value={text} onChange={event => setDrafts(current => ({ ...current, [id]: event.target.value }))} /><span>{text.length} / {MAX_RECORDING_NOTE_LENGTH} characters</span></label>)}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={saving || Object.values(drafts).some(text => text.length > MAX_RECORDING_NOTE_LENGTH)} onClick={() => { void apply() }}>{saving ? 'Saving notes…' : 'Save notes and upload'}</button>
  </section>
}
