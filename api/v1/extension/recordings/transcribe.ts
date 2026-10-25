import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { ExtensionAuthContractError } from '../../../_lib/extension-auth-contracts.js'
import { extensionJsonError, setExtensionCors, setExtensionNoStore } from '../../../_lib/extension-auth-http.js'
import { firstHeaderValue } from '../../../_lib/http.js'
import { RecordingTranscriptionError, transcribeRecordingAudio } from '../../../_lib/recording-transcription.js'

const methods = ['POST', 'OPTIONS']
const MAX_AUDIO_BYTES = 4 * 1024 * 1024
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])

function audioBody(req: VercelRequest) {
  const value = req.body
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return null
}

function isWebm(value: Buffer) {
  return value.length >= WEBM_HEADER.length && value.subarray(0, WEBM_HEADER.length).equals(WEBM_HEADER)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setExtensionNoStore(res)
  try {
    setExtensionCors(req, res, methods)
  } catch (error) {
    const status = error instanceof ExtensionAuthContractError ? error.status : 500
    return extensionJsonError(res, status, status === 500 ? 'Recording transcription is unavailable.' : 'Extension origin is not allowed')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return extensionJsonError(res, 405, 'Method not allowed')
  if (!await requireUser(req, res)) return
  if (firstHeaderValue(req.headers['content-type'])?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/octet-stream') {
    return extensionJsonError(res, 415, 'Recording audio must be WebM.')
  }
  const declaredLength = Number(req.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    return extensionJsonError(res, 413, 'Recording audio is too large.')
  }
  const audio = audioBody(req)
  if (!audio?.length || !isWebm(audio)) return extensionJsonError(res, 400, 'Recording audio is invalid.')
  if (audio.length > MAX_AUDIO_BYTES) return extensionJsonError(res, 413, 'Recording audio is too large.')
  try {
    const transcript = await transcribeRecordingAudio(audio)
    return res.status(200).json({ transcript })
  } catch (error) {
    if (error instanceof RecordingTranscriptionError) return extensionJsonError(res, error.status, error.message)
    return extensionJsonError(res, 502, 'Recording transcription failed.')
  }
}
