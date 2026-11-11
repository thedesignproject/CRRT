import { RecordError } from '../domain-errors.js'

export function assertRecordEnabled() {
  if (process.env.CRRT_RECORD_ENABLED !== 'true') throw new RecordError('record_disabled', 503)
}
