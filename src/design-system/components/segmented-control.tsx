import { cn } from '../lib/cn'

export type Segment<T extends string> = { value: T; label: string; note?: string }

export function SegmentedControl<T extends string>({ label, value, options, onChange, className }: {
  label: string
  value: T
  options: readonly Segment<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('ds-segmented', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          <span>{option.label}</span>{option.note ? <small>{option.note}</small> : null}
        </button>
      ))}
    </div>
  )
}
