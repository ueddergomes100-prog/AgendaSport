import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CreditCard, DollarSign, Link as LinkIcon, Plus, Receipt, TrendingUp, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import { getDashboardStats } from '../lib/data'
import { money } from '../lib/utils'

export function FinancePage() {
  const stats = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardStats })
  const [showChargeForm, setShowChargeForm] = useState(false)
  const chartData = [
    { name: 'Mes', receita: stats.data?.monthly_revenue ?? 0 },
    { name: 'Ano', receita: stats.data?.annual_revenue ?? 0 },
    { name: 'Atrasos', receita: stats.data?.overdue ?? 0 },
  ]

  useEffect(() => {
    if (!showChargeForm) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showChargeForm])

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><WalletCards size={14} /> Financeiro</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Cobrancas, receita e pendencias dos eventos</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Acompanhe mensalistas, avulsos, atrasos e prepare cobrancas para enviar aos participantes.
            </p>
          </div>
          <Button type="button" className="h-12 px-5" onClick={() => setShowChargeForm(true)}>
            <Plus size={18} />
            Nova cobranca
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FinanceStat icon={<DollarSign size={18} />} label="Receita do mes" value={money(stats.data?.monthly_revenue)} />
        <FinanceStat icon={<TrendingUp size={18} />} label="Receita anual" value={money(stats.data?.annual_revenue)} />
        <FinanceStat icon={<Receipt size={18} />} label="Inadimplentes" value={stats.data?.overdue ?? 0} danger />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <CardTitle className="text-xl font-black">Receita e inadimplencia</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Visao consolidada do periodo atual.</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800 dark:bg-green-900/50 dark:text-green-100">Manual PIX</span>
          </div>
          <div className="h-80 p-5">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="receita" fill="#166534" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card className="scoreboard">
            <p className="text-sm text-white/70">Caixa do mes</p>
            <p className="mt-3 text-4xl font-black text-yellow-300">{money(stats.data?.monthly_revenue)}</p>
            <p className="mt-4 text-sm text-white/70">Quando integrarmos gateway, os links e lembretes entram aqui.</p>
          </Card>

          <Card>
            <CardTitle className="font-black">Acoes rapidas</CardTitle>
            <div className="mt-4 grid gap-2">
              <ActionButton icon={<CreditCard size={16} />} label="Preparar cobranca" onClick={() => setShowChargeForm(true)} />
              <ActionButton icon={<LinkIcon size={16} />} label="Copiar link manual" />
              <ActionButton icon={<Bell size={16} />} label="Preparar lembrete" />
            </div>
          </Card>
        </aside>
      </div>

      {showChargeForm && (
        <ChargeModal onClose={() => setShowChargeForm(false)}>
          <form className="grid gap-4">
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <p className="font-black">Nova cobranca</p>
              <p className="mt-1 text-sm text-muted-foreground">Por enquanto o financeiro esta preparado para cobranca manual. Depois plugamos PIX/gateway.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tipo">
                <Select>
                  <option>Mensalidade</option>
                  <option>Avulso por evento</option>
                  <option>Multa por falta</option>
                </Select>
              </Field>
              <Field label="Gateway">
                <Select>
                  <option>Manual PIX</option>
                  <option>Asaas</option>
                  <option>Mercado Pago</option>
                </Select>
              </Field>
              <Field label="Valor"><Input type="number" min={0} /></Field>
              <Field label="Vencimento"><Input type="date" /></Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button"><CreditCard size={16} /> Gerar cobranca</Button>
              <Button type="button" variant="secondary"><LinkIcon size={16} /> Copiar link</Button>
              <Button type="button" variant="ghost"><Bell size={16} /> Enviar lembrete</Button>
            </div>
          </form>
        </ChargeModal>
      )}
    </AnimatedPage>
  )
}

function FinanceStat({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: number | string; danger?: boolean }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`grid size-11 place-items-center rounded-xl ${danger ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100'}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-black">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-white/70 px-3 text-left text-sm font-black transition hover:border-primary hover:bg-green-50 dark:bg-slate-950/40 dark:hover:bg-green-950/30">
      <span className="grid size-9 place-items-center rounded-lg bg-muted text-primary">{icon}</span>
      {label}
    </button>
  )
}

function ChargeModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <PremiumModal title="Nova cobranca" kicker="Cobranca" icon={WalletCards} onClose={onClose}>
      {children}
    </PremiumModal>
  )
}
