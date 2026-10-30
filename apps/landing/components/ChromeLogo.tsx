export function ChromeLogo({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#EA4335" d="M12 0a12 12 0 0 1 10.4 6H12a6 6 0 0 0-5.2 3L3.6 3.5A12 12 0 0 1 12 0Z" />
    <path fill="#FBBC05" d="M22.4 6a12 12 0 0 1-10.4 18l5.2-9A6 6 0 0 0 12 6Z" />
    <path fill="#34A853" d="M12 24A12 12 0 0 1 3.6 3.5L6.8 9a6 6 0 0 0 10.4 6Z" />
    <circle cx="12" cy="12" r="5.3" fill="#4285F4" stroke="white" strokeWidth="1.2" />
  </svg>
}
