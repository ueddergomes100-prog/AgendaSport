import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Plus,
  Receipt,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { ModalPortal } from '../components/ui/modal-portal'
import { AnimatedPage, PremiumModal } from '../components/ui/sport'
import { createCompany, createCompanyAdminUser, deleteCompanyData, getCompanies, updateCompany } from '../lib/data'
import type { Company, CompanyStatus, PlanCode } from '../lib/types'
import { getErrorMessage, nullableFormValue } from '../lib/utils'

export function AdminPage() {
  const queryClient = useQueryClient()
  const companies = useQuery({ queryKey: ['companies'], queryFn: getCompanies })
  const [saving, setSaving] = useState(false)
  const [accessSavingId, setAccessSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const active = (companies.data ?? []).filter((company) => company.status === 'ATIVA').length
  const blocked = (companies.data ?? []).filter((company) => company.status === 'BLOQUEADA').length
  const modalOpen = showCompanyForm || Boolean(editingCompany) || Boolean(deletingCompany)

  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])

  function registrationUrl(token: string) {
    return `${window.location.origin}/inscricao/${token}`
  }

  async function copyText(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  async function copyRegistrationLink(companyName: string, token?: string) {
    if (!token) return
    await copyText(registrationUrl(token))
    setFeedback(`Link de inscricao da ${companyName} copiado.`)
  }

  async function copyWhatsAppInvite(companyName: string, token?: string) {
    if (!token) return
    const link = registrationUrl(token)
    await copyText(`Agenda Sport - faca sua inscricao na ${companyName}: ${link}`)
    setFeedback(`Mensagem de WhatsApp da ${companyName} copiada.`)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      await createCompany({
        name: String(form.get('name')),
        responsible_name: String(form.get('responsible_name')),
        phone: String(form.get('phone') || ''),
        whatsapp: String(form.get('whatsapp') || ''),
        email: String(form.get('email')),
        city: String(form.get('city') || ''),
        state: String(form.get('state') || ''),
        plan_code: String(form.get('plan_code')) as PlanCode,
        due_date: nullableFormValue(form.get('due_date')),
        status: String(form.get('status')) as CompanyStatus,
      })
      await companies.refetch()
      await queryClient.invalidateQueries({ queryKey: ['companies-shell'] })
      formElement.reset()
      setShowCompanyForm(false)
      setFeedback('Empresa cadastrada com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel salvar a empresa.'))
    } finally {
      setSaving(false)
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCompany) return
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(event.currentTarget)
      await updateCompany(editingCompany.id, {
        name: String(form.get('name')),
        responsible_name: String(form.get('responsible_name')),
        phone: String(form.get('phone') || ''),
        whatsapp: String(form.get('whatsapp') || ''),
        email: String(form.get('email')),
        city: String(form.get('city') || ''),
        state: String(form.get('state') || ''),
        plan_code: String(form.get('plan_code')) as PlanCode,
        due_date: nullableFormValue(form.get('due_date')),
        status: String(form.get('status')) as CompanyStatus,
      })
      await companies.refetch()
      await queryClient.invalidateQueries({ queryKey: ['companies-shell'] })
      setEditingCompany(null)
      setFeedback('Empresa atualizada com sucesso.')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel atualizar a empresa.'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteCompany() {
    if (!deletingCompany) return
    setDeleting(true)
    setFeedback('')
    try {
      await deleteCompanyData(deletingCompany.id)
      await companies.refetch()
      await queryClient.invalidateQueries({ queryKey: ['companies-shell'] })
      setFeedback(`Empresa ${deletingCompany.name} e seus dados foram excluidos.`)
      setDeletingCompany(null)
      setDeleteConfirm('')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel excluir a empresa.'))
    } finally {
      setDeleting(false)
    }
  }

  async function createAccess(event: React.FormEvent<HTMLFormElement>, companyId: string, companyName: string) {
    event.preventDefault()
    const formElement = event.currentTarget
    setAccessSavingId(companyId)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      const fullName = String(form.get('access_full_name'))
      const email = String(form.get('access_email'))
      const password = String(form.get('access_password'))
      const role = String(form.get('access_role')) as 'ADMINISTRADOR' | 'ORGANIZADOR' | 'OPERADOR'
      await createCompanyAdminUser({ companyId, fullName, email, password, role })
      await copyText(`Acesso Agenda Sport - ${companyName}\n\nLogin: ${email}\nSenha provisoria: ${password}\n\nAcesse: ${window.location.origin}/login`)
      formElement.reset()
      setFeedback(`Acesso criado para ${companyName}. Credenciais copiadas para enviar no WhatsApp.`)
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel criar o acesso da empresa.'))
    } finally {
      setAccessSavingId(null)
    }
  }

  return (
    <AnimatedPage>
      <section className="premium-panel overflow-hidden rounded-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="page-kicker">
              <Shield size={14} /> Super Admin
            </span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">Empresas, acessos e links de inscricao</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Cadastre empresas, crie o login do administrador e envie o link publico para participantes pelo WhatsApp.
            </p>
          </div>
          <Button className="h-12 px-5" onClick={() => setShowCompanyForm(true)}>
            <Plus size={18} />
            Cadastrar empresa
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <Building2 className="text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Empresas</p>
          <p className="text-2xl font-black">{companies.data?.length ?? 0}</p>
        </Card>
        <Card>
          <Shield className="text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Ativas</p>
          <p className="text-2xl font-black">{active}</p>
        </Card>
        <Card>
          <LockKeyhole className="text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Bloqueadas</p>
          <p className="text-2xl font-black">{blocked}</p>
        </Card>
        <Card>
          <Receipt className="text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Planos</p>
          <p className="text-2xl font-black">3</p>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Empresas cadastradas</h2>
            <p className="text-sm text-muted-foreground">Dados amplos, link publico e acesso administrativo em uma unica area.</p>
          </div>
          {feedback && <p className="rounded-full bg-muted px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{feedback}</p>}
        </div>

        <div className="grid gap-4">
          {(companies.data ?? []).map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              accessSavingId={accessSavingId}
              createAccess={createAccess}
              copyRegistrationLink={copyRegistrationLink}
              copyWhatsAppInvite={copyWhatsAppInvite}
              registrationUrl={registrationUrl}
              onEdit={setEditingCompany}
              onDelete={(company) => {
                setDeletingCompany(company)
                setDeleteConfirm('')
              }}
            />
          ))}
          {!companies.data?.length && (
            <Card className="p-8 text-center">
              <Users className="mx-auto text-primary" />
              <h3 className="mt-3 text-lg font-black">Nenhuma empresa cadastrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">Cadastre a primeira empresa para liberar acessos e links de inscricao.</p>
              <Button className="mt-5" onClick={() => setShowCompanyForm(true)}>
                <Plus size={16} />
                Cadastrar empresa
              </Button>
            </Card>
          )}
        </div>
      </section>

      {showCompanyForm && (
        <CompanyModal title="Cadastrar empresa" description="Cria o tenant e libera a gestao isolada." onClose={() => setShowCompanyForm(false)}>
          <CompanyForm saving={saving} onCancel={() => setShowCompanyForm(false)} onSubmit={submit} submitLabel="Salvar empresa" />
        </CompanyModal>
      )}

      {editingCompany && (
        <CompanyModal title="Editar empresa" description="Atualize dados comerciais, plano e status." onClose={() => setEditingCompany(null)}>
          <CompanyForm company={editingCompany} saving={saving} onCancel={() => setEditingCompany(null)} onSubmit={submitEdit} submitLabel="Salvar alteracoes" />
        </CompanyModal>
      )}

      {deletingCompany && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/65 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-2xl shadow-slate-950/35 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-red-600 text-white">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-xl font-black">Excluir dados da empresa</h2>
                  <p className="text-sm text-muted-foreground">Esta acao remove empresa, participantes, eventos, agendamentos, financeiro e logs vinculados.</p>
                </div>
              </div>
              <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setDeletingCompany(null)} title="Fechar">
                <X size={18} />
              </Button>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Para confirmar, digite exatamente: <strong>{deletingCompany.name}</strong>
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="Confirmacao">
                <Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDeletingCompany(null)}>
                  Cancelar
                </Button>
                <Button type="button" variant="danger" disabled={deleting || deleteConfirm !== deletingCompany.name} onClick={confirmDeleteCompany}>
                  {deleting ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  {deleting ? 'Excluindo...' : 'Excluir tudo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </AnimatedPage>
  )
}

function CompanyCard({
  company,
  accessSavingId,
  createAccess,
  copyRegistrationLink,
  copyWhatsAppInvite,
  registrationUrl,
  onEdit,
  onDelete,
}: {
  company: Company
  accessSavingId: string | null
  createAccess: (event: React.FormEvent<HTMLFormElement>, companyId: string, companyName: string) => Promise<void>
  copyRegistrationLink: (companyName: string, token?: string) => Promise<void>
  copyWhatsAppInvite: (companyName: string, token?: string) => Promise<void>
  registrationUrl: (token: string) => string
  onEdit: (company: Company) => void
  onDelete: (company: Company) => void
}) {
  const link = company.registration_token ? registrationUrl(company.registration_token) : ''
  const enabled = Boolean(company.registration_token && company.registration_enabled)

  return (
    <Card className="p-5">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black">{company.name}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${company.status === 'ATIVA' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{company.status}</span>
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-black text-yellow-800">{company.plan_code}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Empresa isolada para gestao de participantes, eventos e financeiro.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => onEdit(company)}>
              <Edit3 size={16} />
              Editar
            </Button>
            <Button type="button" variant="danger" onClick={() => onDelete(company)}>
              <Trash2 size={16} />
              Excluir dados
            </Button>
            <Button type="button" disabled={!enabled} onClick={() => copyWhatsAppInvite(company.name, company.registration_token)}>
              <MessageCircle size={17} />
              WhatsApp
            </Button>
          </div>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <Info label="Responsavel" value={company.responsible_name} />
          <Info label="Email" value={company.email} />
          <Info label="WhatsApp" value={company.whatsapp || '-'} />
          <Info label="Cidade" value={`${company.city || '-'} ${company.state || ''}`.trim()} />
        </div>

        {enabled ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Link publico de inscricao</p>
                <p className="mt-1 break-all text-sm font-semibold">{link}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => copyRegistrationLink(company.name, company.registration_token)}>
                  <Copy size={16} />
                  Copiar link
                </Button>
                <Button asChild type="button" variant="ghost">
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Abrir
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
            Rode o SQL de inscricao publica para gerar o link desta empresa.
          </div>
        )}

        <details className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
          <summary className="cursor-pointer text-sm font-black">Criar ou reenviar acesso administrativo</summary>
          <form className="mt-3 grid gap-3" onSubmit={(event) => createAccess(event, company.id, company.name)}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Nome">
                <Input name="access_full_name" required placeholder="Responsavel" defaultValue={company.responsible_name} />
              </Field>
              <Field label="Email de login">
                <Input name="access_email" required type="email" placeholder="admin@empresa.com" defaultValue={company.email} />
              </Field>
              <Field label="Senha">
                <Input name="access_password" required minLength={6} defaultValue="AgendaSport123" />
              </Field>
              <Field label="Perfil">
                <Select name="access_role" defaultValue="ADMINISTRADOR">
                  <option value="ADMINISTRADOR">Admin</option>
                  <option value="ORGANIZADOR">Organizador</option>
                  <option value="OPERADOR">Operador</option>
                </Select>
              </Field>
            </div>
            <Button className="w-full md:w-fit" disabled={accessSavingId === company.id} variant="secondary">
              {accessSavingId === company.id ? <LoaderCircle className="animate-spin" size={16} /> : <Users size={16} />}
              {accessSavingId === company.id ? 'Criando acesso...' : 'Criar acesso e copiar login'}
            </Button>
          </form>
        </details>
      </div>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/70 p-3 dark:bg-slate-950/40">
      <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  )
}

function CompanyModal({ title, description, children, onClose }: { title: string; description: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <PremiumModal title={title} kicker={description} icon={Plus} onClose={onClose}>
      {children}
    </PremiumModal>
  )
}

function CompanyForm({
  company,
  saving,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  company?: Company
  saving: boolean
  submitLabel: string
  onCancel: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome">
          <Input name="name" required defaultValue={company?.name ?? ''} />
        </Field>
        <Field label="Responsavel">
          <Input name="responsible_name" required defaultValue={company?.responsible_name ?? ''} />
        </Field>
        <Field label="Telefone">
          <Input name="phone" defaultValue={company?.phone ?? ''} />
        </Field>
        <Field label="WhatsApp">
          <Input name="whatsapp" defaultValue={company?.whatsapp ?? ''} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required defaultValue={company?.email ?? ''} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade">
            <Input name="city" defaultValue={company?.city ?? ''} />
          </Field>
          <Field label="Estado">
            <Input name="state" maxLength={2} defaultValue={company?.state ?? ''} />
          </Field>
        </div>
        <Field label="Plano">
          <Select name="plan_code" defaultValue={company?.plan_code ?? 'Starter'}>
            <option>Starter</option>
            <option>Pro</option>
            <option>Elite</option>
          </Select>
        </Field>
        <Field label="Vencimento">
          <Input name="due_date" type="date" defaultValue={company?.due_date ?? ''} />
        </Field>
      </div>
      <Field label="Status">
        <Select name="status" defaultValue={company?.status ?? 'ATIVA'}>
          <option>ATIVA</option>
          <option>BLOQUEADA</option>
          <option>TRIAL</option>
          <option>CANCELADA</option>
        </Select>
      </Field>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={saving}>
          {saving ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          {saving ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
