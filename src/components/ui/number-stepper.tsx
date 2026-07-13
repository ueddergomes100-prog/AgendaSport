import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

type NumberStepperProps = {
  name: string
  label: string
  defaultValue?: number | null
  min?: number
  disabled?: boolean
  className?: string
  onValueChange?: (value: number) => void
}

export function NumberStepper({ name, label, defaultValue = 0, min = 0, disabled, className, onValueChange }: NumberStepperProps) {
  const [value, setValue] = useState(() => Math.max(min, Number(defaultValue ?? 0) || 0))

  function change(delta: number) {
    setValue((current) => {
      const next = Math.max(min, current + delta)
      if (next !== current) onValueChange?.(next)
      return next
    })
  }

  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <span className="text-sm font-black text-slate-700 dark:text-slate-200">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="grid h-14 min-w-0 grid-cols-[52px_minmax(0,1fr)_52px] overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-slate-900">
        <button
          type="button"
          onClick={() => change(-1)}
          disabled={disabled || value <= min}
          className="grid h-full place-items-center border-r border-border bg-slate-50 text-slate-800 transition hover:bg-slate-100 active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
          aria-label={`Diminuir ${label}`}
        >
          <Minus size={20} strokeWidth={3} />
        </button>
        <output className="grid min-w-0 place-items-center px-2 text-2xl font-black text-slate-950 dark:text-white" aria-label={`${label}: ${value}`}>
          {value}
        </output>
        <button
          type="button"
          onClick={() => change(1)}
          disabled={disabled}
          className="grid h-full place-items-center border-l border-border bg-green-700 text-white transition hover:bg-green-800 active:bg-green-900 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Aumentar ${label}`}
        >
          <Plus size={20} strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
