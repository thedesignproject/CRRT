import type { LocalRecording } from './recording'
import { transcribeRecording } from './recording-transcription-api'

export async function withRecordingTranscript(recording: LocalRecording): Promise<LocalRecording> {
  if (!recording.audioBlob?.size) {
    return { ...recording, status: 'ready', transcript: [], transcriptionStatus: 'ready', transcriptionError: undefined, transcriptionErrorCode: undefined }
  }
  try {
    const transcript = await transcribeRecording(recording.audioBlob)
    return { ...recording, status: 'ready', transcript: transcript.segments, transcriptionStatus: 'ready', transcriptionError: undefined, transcriptionErrorCode: undefined }
  } catch (error) {
    const code = error instanceof Error && 'code' in error && error.code === 'auth-required'
      ? 'auth-required'
      : 'request-failed'
    return {
      ...recording,
      status: 'ready',
      transcript: [],
      transcriptionStatus: 'failed',
      transcriptionError: error instanceof Error ? error.message : 'CRRT could not transcribe this recording.',
      transcriptionErrorCode: code,
    }
  }
}
