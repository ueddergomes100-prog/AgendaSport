import { motion } from 'framer-motion'
import { AlertTriangle, LoaderCircle, Sparkles, Trophy, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Card } from './card'
import { ModalPortal } from './modal-portal'

export function AnimatedPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn('grid gap-6', className)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(4px)' }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  )
}

export function PageHeader({
  icon: Icon = Trophy,
  kicker,
  title,
  description,
  actions,
  children,
}: {
  icon?: LucideIcon
  kicker: string
  title: string
  description: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="premium-panel sport-page-header overflow-hidden rounded-2xl p-6">
      <StadiumGlow />
      <FieldLinesBackground />
      <div className="relative z-10 grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
        <div>
          <span className="page-kicker">
            <Icon size={14} />
            {kicker}
          </span>
          <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2 xl:justify-end">{actions}</div>}
      </div>
      {children && <div className="relative z-10 mt-6">{children}</div>}
    </section>
  )
}

export function StadiumGlow() {
  return <span className="stadium-glow" aria-hidden="true" />
}

export function FieldLinesBackground() {
  return <span className="field-lines-background" aria-hidden="true" />
}

export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('glow-card', className)}>{children}</Card>
}

export function MetricCard({ icon: Icon, label, value, tone = 'green' }: { icon: LucideIcon; label: string; value: ReactNode; tone?: 'green' | 'yellow' | 'red' | 'dark' }) {
  const tones = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100',
    yellow: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
    dark: 'bg-slate-950 text-white dark:bg-white dark:text-slate-950',
  }

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.18 }}>
      <Card className="metric-card">
        <div className="flex items-center gap-3">
          <div className={cn('grid size-11 place-items-center rounded-xl', tones[tone])}>
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="truncate text-2xl font-black">{value}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function ActionCard({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <Card className="action-card">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </Card>
  )
}

export function EmptyState({
  icon: Icon = Trophy,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={cn('empty-state', className)}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28 }}
    >
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
        <Icon size={24} />
      </div>
      <p className="mt-4 text-lg font-black">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </motion.div>
  )
}

export function LoadingState({ label = 'Carregando Agenda Sport...' }: { label?: string }) {
  return (
    <div className="login-arena grid min-h-screen place-items-center px-4 text-white">
      <div className="login-arena-bg" />
      <motion.div className="relative z-10 grid place-items-center gap-4 text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <img src="/agendasport.svg" alt="Agenda Sport" className="size-20 rounded-2xl shadow-2xl shadow-black/30" />
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-yellow-300">Agenda Sport</p>
          <p className="mt-2 text-lg font-black">{label}</p>
        </div>
        <LoaderCircle className="animate-spin text-yellow-300" size={26} />
      </motion.div>
    </div>
  )
}

export function FormCard({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  return (
    <Card className="form-card">
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-xl font-black">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </Card>
  )
}

export function PremiumModal({
  title,
  kicker,
  icon: Icon = Sparkles,
  children,
  onClose,
  maxWidth = 'max-w-2xl',
}: {
  title: string
  kicker?: string
  icon?: LucideIcon
  children: ReactNode
  onClose: () => void
  maxWidth?: string
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/68 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
        <motion.div
          className={cn('premium-modal flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-950/35 dark:bg-slate-950', maxWidth)}
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-white/95 p-5 backdrop-blur dark:bg-slate-950/95">
            <div>
              {kicker && (
                <p className="page-kicker">
                  <Icon size={14} />
                  {kicker}
                </p>
              )}
              <h2 className={cn('text-2xl font-black', kicker && 'mt-3')}>{title}</h2>
            </div>
            <Button type="button" variant="ghost" className="size-10 p-0" onClick={onClose} title="Fechar">
              <X size={18} />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </motion.div>
      </div>
    </ModalPortal>
  )
}

export function ConfirmDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <PremiumModal title={title} kicker="Confirmacao" icon={AlertTriangle} onClose={onClose} maxWidth="max-w-xl">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
        {description}
      </div>
      <div className="mt-4">{children}</div>
    </PremiumModal>
  )
}

export function StatusBadge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'yellow' | 'red' | 'slate' }) {
  const tones = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100',
    yellow: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  }

  return <span className={cn('status-badge', tones[tone])}>{children}</span>
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('filter-bar', className)}>{children}</div>
}

export function AnimatedTabs({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('animated-tabs', className)}>{children}</div>
}

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('data-table overflow-x-auto rounded-lg border border-border', className)}>{children}</div>
}

export const SportButton = Button
