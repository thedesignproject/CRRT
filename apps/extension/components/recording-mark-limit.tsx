import { MAX_RECORDING_MARKS } from '../lib/recording'
export function RecordingMarkLimit({ count, sizeLimited, error }: { count: number; sizeLimited?: boolean; error?: string | null }) {
  return error ? <div role="alert" className="surface-warning" data-record-control>{error}</div> : count >= MAX_RECORDING_MARKS || sizeLimited ? <div role="status" className="surface-warning" data-record-control>Annotation capacity reached. Undo or clear marks to add more. Recording continues.</div> : null
}
