import { forwardRef, type ComponentPropsWithoutRef, type ForwardedRef, type MouseEvent, type ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Visual style of a {@link Button}. Only sets the look; the rendered element
 * comes from `href`.
 *
 * - `primary` — the main action. Use at most one per section or dialog, and
 *   never place two Primary buttons next to each other.
 * - `secondary` — supporting actions, including Cancel in dialog footers.
 * - `ghost` — low-emphasis actions with no fill until hovered.
 * - `destructive` — irreversible or data-removing actions (delete, disconnect,
 *   remove). In dialog footers it takes the Primary's place.
 * - `link` — text-only actions with no padding.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'

/** Height of a {@link Button}: `sm` is 28px (default) and `md` is 32px (dialog footers). `link` ignores size. */
export type ButtonSize = 'sm' | 'md'

type ButtonOwnProps = {
  /** Visual style. Defaults to `'primary'`. One Primary per section or dialog; Destructive for irreversible actions. */
  variant?: ButtonVariant
  /** Height: `'sm'` (28px) or `'md'` (32px). Defaults to `'sm'`. Ignored by `variant="link"`. */
  size?: ButtonSize
  /** Icon shown before the label, rendered at 14px and hidden from assistive tech. */
  leftIcon?: ReactNode
  /** Icon shown after the label, rendered at 14px and hidden from assistive tech. */
  rightIcon?: ReactNode
  /** Visible label. Required: icon-only actions use Icon Button instead. */
  children: ReactNode
  /** Fades the button to 50% and blocks clicks. On a link, also removes the `href`. */
  disabled?: boolean
}

/** Props when `Button` renders a `<button type="button">` for an in-page action. */
export type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonOwnProps> & {
    /** Leave unset for actions. Passing `href` renders a link instead. */
    href?: undefined
  }

/** Props when `Button` renders an `<a>` for navigation. */
export type ButtonAsLinkProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof ButtonOwnProps> & {
    /** Destination. Renders an `<a>`. Build dashboard paths with `route()` from `lib/routes`. */
    href: string
  }

/**
 * Props for {@link Button}. Pass `href` to navigate (renders `<a>`); omit it
 * to run an action (renders `<button type="button">`).
 */
export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps

// Pressed reuses the hover colors (active:) and adds a 96% press; see Figma State=Pressed.
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground font-semibold hover:opacity-90 active:opacity-90',
  secondary: 'border border-border bg-card text-foreground font-semibold hover:bg-accent active:bg-accent',
  ghost: 'text-muted-foreground font-medium hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground font-semibold hover:opacity-90 active:opacity-90',
  link: 'text-primary font-semibold underline-offset-2 hover:underline active:underline',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-3',
  md: 'h-8 px-3',
}

/**
 * Class names for the CRRT Button look. Prefer rendering {@link Button};
 * use this only when markup cannot go through the component.
 */
export function buttonClassName({ variant = 'primary', size = 'sm', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs transition duration-[80ms]',
    'active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:size-3.5 [&_svg]:shrink-0',
    variant === 'link' ? 'p-0' : sizeClasses[size],
    variantClasses[variant],
    className,
  )
}

function Content({ leftIcon, rightIcon, children }: Pick<ButtonOwnProps, 'leftIcon' | 'rightIcon' | 'children'>) {
  return (
    <>
      {leftIcon ? <span aria-hidden="true" className="inline-flex">{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span aria-hidden="true" className="inline-flex">{rightIcon}</span> : null}
    </>
  )
}

/**
 * CRRT dashboard button, matching the Figma "Button" component set
 * (CRRT – Design System, node 5011:47001).
 *
 * Renders `<a>` when `href` is set (navigation) and `<button type="button">`
 * otherwise (action). Use one Primary per section or dialog, and never two
 * Primary buttons next to each other. There is no loading state.
 */
// forwardRef keeps refs working on React 18, which the package still supports.
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(props, ref) {
  if (props.href !== undefined) {
    const { variant, size, leftIcon, rightIcon, children, className, href, disabled, onClick, ...rest } = props
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (disabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }
    return (
      <a
        {...rest}
        ref={ref as ForwardedRef<HTMLAnchorElement>}
        href={disabled ? undefined : href}
        role={disabled ? 'link' : rest.role}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        className={buttonClassName({ variant, size, className })}
      >
        <Content leftIcon={leftIcon} rightIcon={rightIcon}>{children}</Content>
      </a>
    )
  }

  const { variant, size, leftIcon, rightIcon, children, className, type = 'button', ...rest } = props
  return (
    <button {...rest} ref={ref as ForwardedRef<HTMLButtonElement>} type={type} className={buttonClassName({ variant, size, className })}>
      <Content leftIcon={leftIcon} rightIcon={rightIcon}>{children}</Content>
    </button>
  )
})
