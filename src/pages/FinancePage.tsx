import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CreditCard, DollarSign, LoaderCircle, Plus, Receipt, Save, Trash2, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import {
  createFinanceTransaction,
  createPayment,
  deleteFinanceTransaction,
  getBillingSettings,
  getDashboardStats,
  getFinanceTransactions,
  getPayments,
  getPlayers,
  runMonthlyBilling,
  updatePayment,
} from '../lib/data'
import type { FinanceTransaction, Payment, PaymentStatus } from '../lib/types'
import { getErrorMessage, money } from '../lib/utils'

type ModalMode = 'payment' | 'transaction' | null

const transactionCategories = {
  RECEITA: ['Mensalidade', 'Avulso', 'Patrocinio', 'Material vendido', 'Outras receitas'],
  DESPESA: ['Quadra', 'Bolas', 'Coletes', 'Arbitragem', 'Materiais', 'Outras despesas'],
}

export function FinancePage() {
  const stats = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardStats })
  const payments = useQuery({ queryKey: ['payments'], queryFn: getPayments })
  const transactions = useQuery({ queryKey: ['finance-transactions'], queryFn: getFinanceTransactions })
  const players = useQuery({ queryKey: ['players'], queryFn: getPlayers })
  const billing = useQuery({ queryKey: ['billing-settings'], queryFn: getBillingSettings })
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  const paidPayments = (payments.data ?? []).filter((payment) => payment.status === 'PAGO')
  const pendingPayments = (payments.data ?? []).filter((payment) => ['PENDENTE', 'ATRASADO'].includes(payment.status))
  const confirmedTransactions = (transactions.data ?? []).filter((item) => item.status === 'CONFIRMADO')
  const revenue = paidPayments.reduce((sum, payment) => sum + Number(payment.amount), 0) + confirmedTransactions.filter((item) => item.kind === 'RECEITA').reduce((sum, item) => sum + Number(item.amount), 0)
  const expenses = confirmedTransactions.filter((item) => item.kind === 'DESPESA').reduce((sum, item) => sum + Number(item.amount), 0)
  const balance = revenue - expenses
  const chartData = [
    { name: 'Receitas', valor: revenue },
    { name: 'Despesas', valor: expenses },
    { name: 'Saldo', valor: balance },
  ]
  const timeline = useMemo(() => {
    const paymentItems = (payments.data ?? []).map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.paid_at ?? payment.due_date,
      title: payment.player?.name ?? 'Cobranca',
      description: `${payment.provider} - ${payment.status}`,
      amount: Number(payment.amount),
      kind: 'RECEITA' as const,
      status: payment.status,
    }))
    const transactionItems = (transactions.data ?? []).map((item) => ({
      id: `transaction-${item.id}`,
      date: item.occurred_on,
      title: item.description,
      description: `${item.category} - ${item.status}`,
      amount: Number(item.amount),
      kind: item.kind,
      status: item.status,
      raw: item,
    }))
    return [...paymentItems, ...transactionItems].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()).slice(0, 20)
  }, [payments.data, transactions.data])

  async function refreshFinance() {
    await Promise.all([stats.refetch(), payments.refetch(), transactions.refetch()])
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(event.currentTarget)
      const status = String(form.get('status')) as PaymentStatus
      await createPayment({
        player_id: String(form.get('player_id') || '') || null,
        provider: String(form.get('provider') || 'MANUAL_PIX'),
        amount: Number(form.get('amount') || 0),
        due_date: String(form.get('due_date')),
        status,
        paid_at: status === 'PAGO' ? new Date().toISOString() : null,
      })
      await refreshFinance()
      setModalMode(null)
      setFeedback('Cobranca cadastrada com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel cadastrar a cobranca.'))
    } finally {
      setSaving(false)
    }
  }

  async function submitTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(event.currentTarget)
      await createFinanceTransaction({
        kind: String(form.get('kind')) as FinanceTransaction['kind'],
        category: String(form.get('category')),
        description: String(form.get('description')),
        amount: Number(form.get('amount') || 0),
        occurred_on: String(form.get('occurred_on')),
        status: String(form.get('status')) as FinanceTransaction['status'],
      })
      await refreshFinance()
      setModalMode(null)
      setFeedback('Movimentacao cadastrada com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel cadastrar a movimentacao.'))
    } finally {
      setSaving(false)
    }
  }

  async function markPaymentPaid(payment: Payment) {
    setFeedback('')
    try {
      await updatePayment(payment.id, { status: 'PAGO', paid_at: new Date().toISOString() })
      await refreshFinance()
      setFeedback('Pagamento marcado como recebido.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel marcar pagamento como recebido.'))
    }
  }

  async function generateMonthlyBilling() {
    setSaving(true)
    setFeedback('')
    try {
      const result = await runMonthlyBilling()
      await refreshFinance()
      setFeedback(`${result.created} mensalidade(s) gerada(s), ${result.skipped} ja existiam. Vencimento: ${formatDate(result.due_date)}.`)
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel gerar as mensalidades.'))
    } finally {
      setSaving(false)
    }
  }

  async function removeTransaction(transaction: FinanceTransaction) {
    setFeedback('')
    try {
      await deleteFinanceTransaction(transaction.id)
      await refreshFinance()
      setFeedback('Movimentacao removida.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel remover a movimentacao.'))
    }
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <span className="page-kicker"><WalletCards size={14} /> Financeiro</span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Receitas, despesas e cobrancas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Controle mensalistas, avulsos, despesas do grupo, inadimplentes e saldo atual da empresa.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" className="h-12 px-5" onClick={() => setModalMode('transaction')}>
              <Plus size={18} />
              Movimentacao
            </Button>
            <Button type="button" className="h-12 px-5" onClick={() => setModalMode('payment')}>
              <CreditCard size={18} />
              Cobranca
            </Button>
          </div>
        </div>
      </section>

      {feedback && <p className="rounded-lg border border-border bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">{feedback}</p>}

      <section className="grid gap-4 md:grid-cols-4">
        <FinanceStat icon={<TrendingUp size={18} />} label="Receitas" value={money(revenue)} />
        <FinanceStat icon={<TrendingDown size={18} />} label="Despesas" value={money(expenses)} danger />
        <FinanceStat icon={<DollarSign size={18} />} label="Saldo atual" value={money(balance)} danger={balance < 0} />
        <FinanceStat icon={<Receipt size={18} />} label="Pendentes" value={pendingPayments.length} danger />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <CardTitle className="text-xl font-black">Fluxo financeiro</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Receitas confirmadas, despesas e saldo operacional.</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800 dark:bg-green-900/50 dark:text-green-100">
              Mensalidade dia {billing.data?.monthly_billing_day ?? 2}
            </span>
          </div>
          <div className="h-80 p-5">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="valor" fill="#166534" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card className="scoreboard">
            <p className="text-sm text-white/70">Saldo operacional</p>
            <p className="mt-3 text-4xl font-black text-yellow-300">{money(balance)}</p>
            <p className="mt-4 text-sm text-white/70">Receitas pagas menos despesas confirmadas.</p>
          </Card>

          <Card>
            <CardTitle className="font-black">Cobrancas pendentes</CardTitle>
            <Button type="button" variant="secondary" className="mt-4 h-10 w-full" onClick={generateMonthlyBilling} disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" size={15} /> : <Receipt size={15} />}
              Gerar mensalidades
            </Button>
            <div className="mt-4 grid gap-2">
              {pendingPayments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
                  <p className="font-black">{payment.player?.name ?? 'Participante'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Vence em {formatDate(payment.due_date)} - {money(payment.amount)}</p>
                  <Button type="button" variant="secondary" className="mt-3 h-9 w-full" onClick={() => markPaymentPaid(payment)}>
                    <CheckCircle2 size={15} />
                    Recebido
                  </Button>
                </div>
              ))}
              {!pendingPayments.length && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhuma cobranca pendente.</p>}
            </div>
          </Card>
        </aside>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Historico de movimentacoes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Receitas, despesas e cobrancas recentes.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setModalMode('transaction')}>
            <Plus size={16} />
            Lancar
          </Button>
        </div>
        <div className="mt-4 grid gap-2">
          {timeline.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-xl border border-border bg-white/80 p-3 dark:bg-slate-950/40 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.kind === 'DESPESA' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{item.kind}</span>
                  <p className="font-black">{item.title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.date)} - {item.description}</p>
              </div>
              <p className={`text-lg font-black ${item.kind === 'DESPESA' ? 'text-red-700' : 'text-green-800'}`}>{item.kind === 'DESPESA' ? '-' : '+'}{money(item.amount)}</p>
              {'raw' in item && item.raw ? (
                <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => removeTransaction(item.raw)}>
                  <Trash2 size={15} />
                  Remover
                </Button>
              ) : null}
            </div>
          ))}
          {!timeline.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma movimentacao financeira cadastrada.</p>}
        </div>
      </Card>

      {modalMode === 'payment' && (
        <FinanceModal title="Nova cobranca" onClose={() => setModalMode(null)}>
          <form className="grid gap-4" onSubmit={submitPayment}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Participante">
                <Select name="player_id">
                  <option value="">Sem participante</option>
                  {(players.data ?? []).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </Select>
              </Field>
              <Field label="Tipo/Gateway">
                <Select name="provider" defaultValue={billing.data?.default_provider ?? 'MANUAL_PIX'}>
                  <option value="MANUAL_PIX">Manual PIX</option>
                  <option value="ASAAS">Asaas</option>
                  <option value="MERCADO_PAGO">Mercado Pago</option>
                  <option value="STONE">Stone</option>
                  <option value="VINDI">Vindi</option>
                </Select>
              </Field>
              <Field label="Valor"><Input name="amount" required type="number" min={0.01} step="0.01" /></Field>
              <Field label="Vencimento"><Input name="due_date" required type="date" defaultValue={todayDate()} /></Field>
              <Field label="Status">
                <Select name="status" defaultValue="PENDENTE">
                  <option value="PENDENTE">Pendente</option>
                  <option value="PAGO">Pago</option>
                  <option value="ATRASADO">Atrasado</option>
                  <option value="CANCELADO">Cancelado</option>
                </Select>
              </Field>
            </div>
            <Button className="min-h-12" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <CreditCard size={16} />}
              {saving ? 'Salvando...' : 'Salvar cobranca'}
            </Button>
          </form>
        </FinanceModal>
      )}

      {modalMode === 'transaction' && (
        <FinanceModal title="Nova movimentacao" onClose={() => setModalMode(null)}>
          <TransactionForm saving={saving} onSubmit={submitTransaction} />
        </FinanceModal>
      )}
    </AnimatedPage>
  )
}

function TransactionForm({ saving, onSubmit }: { saving: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [kind, setKind] = useState<FinanceTransaction['kind']>('DESPESA')
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Tipo">
          <Select name="kind" value={kind} onChange={(event) => setKind(event.target.value as FinanceTransaction['kind'])}>
            <option value="DESPESA">Despesa</option>
            <option value="RECEITA">Receita</option>
          </Select>
        </Field>
        <Field label="Categoria">
          <Select name="category">
            {transactionCategories[kind].map((category) => <option key={category} value={category}>{category}</option>)}
          </Select>
        </Field>
        <Field label="Valor"><Input name="amount" required type="number" min={0.01} step="0.01" /></Field>
        <Field label="Data"><Input name="occurred_on" required type="date" defaultValue={todayDate()} /></Field>
        <Field label="Status">
          <Select name="status" defaultValue="CONFIRMADO">
            <option value="CONFIRMADO">Confirmado</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CANCELADO">Cancelado</option>
          </Select>
        </Field>
      </div>
      <Field label="Descricao">
        <Textarea name="description" required minLength={3} placeholder="Ex.: Pagamento da quadra, compra de bolas, patrocinio..." />
      </Field>
      <Button className="min-h-12" disabled={saving}>
        {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
        {saving ? 'Salvando...' : 'Salvar movimentacao'}
      </Button>
    </form>
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

function FinanceModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <PremiumModal title={title} kicker="Financeiro" icon={WalletCards} onClose={onClose}>
      {children}
    </PremiumModal>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}
