import { expect, it, vi } from 'vitest'
import { hasRecordingPermissions, requestRecordingPermissions } from './recording-permissions'

it('checks only the selected devices and requires all selected permissions', async () => {
  const query = vi.fn().mockResolvedValue({ state: 'granted' })
  const permissions = { query } as unknown as Permissions
  expect(await hasRecordingPermissions({ cameraEnabled: false, microphoneEnabled: false }, permissions)).toBe(true)
  expect(query).not.toHaveBeenCalled()
  expect(await hasRecordingPermissions({ cameraEnabled: true, microphoneEnabled: true }, permissions)).toBe(true)
  expect(query.mock.calls).toEqual([[{ name: 'camera' }], [{ name: 'microphone' }]])
  query.mockResolvedValueOnce({ state: 'prompt' })
  expect(await hasRecordingPermissions({ cameraEnabled: true, microphoneEnabled: false }, permissions)).toBe(false)
  query.mockResolvedValueOnce({ state: 'denied' })
  expect(await hasRecordingPermissions({ cameraEnabled: false, microphoneEnabled: true }, permissions)).toBe(false)
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: permissions })
  expect(await hasRecordingPermissions({ cameraEnabled: true, microphoneEnabled: false })).toBe(true)
})

it('releases permission-check streams before the recorder takes over', async () => {
  const stop = vi.fn()
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }, { stop }] })
  const mediaDevices = { getUserMedia } as unknown as MediaDevices
  await requestRecordingPermissions({ cameraEnabled: true, microphoneEnabled: true }, mediaDevices)
  expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: true })
  expect(stop).toHaveBeenCalledTimes(2)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
  await requestRecordingPermissions({ cameraEnabled: false, microphoneEnabled: true })
  expect(getUserMedia).toHaveBeenLastCalledWith({ video: false, audio: true })
  getUserMedia.mockRejectedValueOnce(new Error('Permission dismissed'))
  await expect(requestRecordingPermissions({ cameraEnabled: true, microphoneEnabled: false })).rejects.toThrow('Permission dismissed')
})
