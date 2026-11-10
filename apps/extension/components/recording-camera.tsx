import { CameraOff, X } from 'lucide-react'
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
  onSizeChange,
  onClose,
}: {
  videoRef: { readonly current: HTMLVideoElement | null }
  size: CameraPreviewSize
  onSizeChange: (size: CameraPreviewSize) => void
  onClose: () => void
}) {
  return <div className={`recording-camera camera-size-${size}`} data-record-control>
    <button className="recording-camera-preview" aria-label="Camera preview settings" title="Camera preview settings">
      <video ref={videoRef} muted playsInline />
      <span>Camera</span>
    </button>
    <div className="recording-camera-menu" aria-label="Camera preview controls">
      <div role="group" aria-label="Camera size">
        {sizes.map(({ id, label }) => <button key={id} aria-label={`${label} camera`} aria-pressed={size === id} title={`${label} camera`} onClick={() => onSizeChange(id)}>{label[0]}</button>)}
      </div>
      <button className="camera-close" aria-label="Close camera" title="Close camera" onClick={onClose}><X size={13} /><span>Close</span></button>
    </div>
  </div>
}

export function RestoreCameraButton({ onClick }: { onClick: () => void }) {
  return <button className="icon camera-restore" title="Turn camera on" aria-label="Turn camera on" onClick={onClick}><CameraOff size={15} /></button>
}
