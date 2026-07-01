import type { ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  asChild?: boolean
}

export function Button({ className, variant = 'primary', asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm shadow-green-900/20 hover:bg-green-800',
    secondary: 'bg-secondary text-white hover:bg-slate-950',
    ghost: 'bg-transparent text-foreground hover:bg-muted',
    danger: 'bg-danger text-white hover:bg-red-700',
  }

  return (
    <Component
      className={cn(
        'sport-button inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-center text-sm font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
