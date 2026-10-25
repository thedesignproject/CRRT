import type { RefObject } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import './recording-camera.css'

export type CameraPreviewSize = 'small' | 'medium' | 'large'

const sizes: { id: CameraPreviewSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
]

export function RecordingCamera({
  videoRef,
  size,
  hidden = false,
  onSizeChange,
  onHide,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  size: CameraPreviewSize
  hidden?: boolean
  onSizeChange: (size: CameraPreviewSize) => void
  onHide: () => void
}) {
  return <div className={`recording-camera camera-size-${size}`} data-record-control hidden={hidden}>
    <button className="recording-camera-preview" aria-label="Camera preview settings" title="Camera preview settings">
      <video ref={videoRef} muted playsInline />
      <span>Camera</span>
    </button>
    <div className="recording-camera-menu" aria-label="Camera preview controls">
      <div role="group" aria-label="Camera size">
        {sizes.map(({ id, label }) => <button key={id} aria-label={`${label} camera`} aria-pressed={size === id} title={`${label} camera`} onClick={() => onSizeChange(id)}>{label[0]}</button>)}
      </div>
      <button className="camera-hide" onClick={onHide}><CameraOff size={13} /><span>Hide</span></button>
    </div>
  </div>
}

export function RestoreCameraButton({ onClick }: { onClick: () => void }) {
  return <button className="icon camera-restore" title="Show camera" aria-label="Show camera" onClick={onClick}><Camera size={15} /></button>
}
