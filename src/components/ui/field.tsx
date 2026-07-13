import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
      {label}
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('sport-field h-10 w-full min-w-0 rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 dark:bg-slate-900', props.className)} {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('sport-field h-10 w-full min-w-0 rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 dark:bg-slate-900', props.className)} {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('sport-field min-h-24 w-full min-w-0 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 dark:bg-slate-900', props.className)} {...props} />
}
