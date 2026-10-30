export type RecordingDevices = { cameraEnabled: boolean; microphoneEnabled: boolean }

export async function hasRecordingPermissions(devices: RecordingDevices, permissions = navigator.permissions) {
  const names: PermissionName[] = []
  if (devices.cameraEnabled) names.push('camera')
  if (devices.microphoneEnabled) names.push('microphone')
  const states = await Promise.all(names.map((name) => permissions.query({ name })))
  return states.every((state) => state.state === 'granted')
}

export async function requestRecordingPermissions(devices: RecordingDevices, mediaDevices = navigator.mediaDevices) {
  const stream = await mediaDevices.getUserMedia({ video: devices.cameraEnabled, audio: devices.microphoneEnabled })
  stream.getTracks().forEach((track) => track.stop())
}
