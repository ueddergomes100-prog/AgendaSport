import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Goal, LoaderCircle, MessageCircle, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field, Input, Select } from '../components/ui/field'
import { AnimatedPage } from '../components/ui/sport'
import { getPublicRegistrationCompany, publicRegisterPlayer } from '../lib/data'
import { getErrorMessage } from '../lib/utils'

export function PublicRegistrationPage() {
  const { token = '' } = useParams()
  const company = useQuery({ queryKey: ['registration-company', token], queryFn: () => getPublicRegistrationCompany(token), enabled: Boolean(token) })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [registeredName, setRegisteredName] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setFeedback('')
    try {
      const form = new FormData(formElement)
      const firstName = String(form.get('first_name')).trim()
      const lastName = String(form.get('last_name')).trim()
      await publicRegisterPlayer({
        token,
        firstName,
        lastName,
        whatsapp: String(form.get('whatsapp')),
        kind: String(form.get('kind')) as 'GOLEIRO' | 'LINHA',
      })
      setRegisteredName(`${firstName} ${lastName}`.trim())
      formElement.reset()
      setFeedback('')
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Nao foi possivel concluir sua inscricao.'))
    } finally {
      setSaving(false)
    }
  }

  const unavailable = company.data && (!company.data.registration_enabled || company.data.status === 'BLOQUEADA' || company.data.status === 'CANCELADA')

  return (
    <main className="football-surface min-h-screen px-4 py-8 text-white">
      <div className="stadium-lights" />
      <AnimatedPage className="relative z-10 mx-auto min-h-[calc(100vh-4rem)] max-w-6xl items-center lg:grid-cols-[1fr_440px]">
        <section>
          <div className="mb-6 inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-200">
            <Goal size={15} />
            Inscricao de participante
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            {company.data?.name ? `Inscricao Agenda Sport - ${company.data.name}` : 'Inscricao Agenda Sport'}
          </h1>
          <p className="mt-4 max-w-xl text-white/75">Preencha seus dados para entrar na lista da empresa. O organizador usa essas informacoes para confirmar presenca e montar equipes.</p>
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/14 bg-white/10 p-4 backdrop-blur">
              <Users className="text-yellow-300" size={22} />
              <p className="mt-3 font-black">Lista certa</p>
              <p className="mt-1 text-sm text-white/70">Seu cadastro entra direto na empresa correta.</p>
            </div>
            <div className="rounded-2xl border border-white/14 bg-white/10 p-4 backdrop-blur">
              <Trophy className="text-yellow-300" size={22} />
              <p className="mt-3 font-black">Dia do evento</p>
              <p className="mt-1 text-sm text-white/70">Depois e so esperar a chamada no WhatsApp.</p>
            </div>
          </div>
        </section>

        <Card className="rounded-2xl border-white/20 bg-white/95 p-6 text-slate-950 shadow-2xl shadow-black/25">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-md bg-primary text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black">Minha inscricao</h2>
              <p className="text-sm text-slate-500">Nome, sobrenome, WhatsApp e funcao.</p>
            </div>
          </div>

          {company.isLoading && <p className="text-sm text-slate-500">Carregando inscricao...</p>}
          {!company.isLoading && !company.data && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Link de inscricao invalido.</p>}
          {unavailable && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Inscricao indisponivel para esta empresa.</p>}

          {company.data && !unavailable && registeredName && (
            <div className="registration-success grid place-items-center py-4 text-center">
              <div className="success-ring relative grid size-24 place-items-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="success-check" size={52} strokeWidth={2.6} />
              </div>
              <h2 className="mt-5 text-2xl font-black text-slate-950">Participante cadastrado!</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                {registeredName} entrou na lista da {company.data.name}. Agora e so aguardar a convocacao pelo WhatsApp.
              </p>
              <div className="mt-5 flex items-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm font-black text-green-800">
                <MessageCircle size={16} />
                Cadastro enviado com sucesso
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-6"
                onClick={() => {
                  setRegisteredName('')
                  setFeedback('')
                }}
              >
                <Users size={16} />
                Cadastrar outro participante
              </Button>
            </div>
          )}

          {company.data && !unavailable && !registeredName && (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome">
                  <Input name="first_name" required minLength={2} placeholder="Seu nome" />
                </Field>
                <Field label="Sobrenome">
                  <Input name="last_name" required minLength={2} placeholder="Seu sobrenome" />
                </Field>
              </div>
              <Field label="WhatsApp">
                <Input name="whatsapp" required placeholder="DDD + numero" />
              </Field>
              <Field label="Funcao no jogo">
                <Select name="kind" required>
                  <option value="LINHA">Linha</option>
                  <option value="GOLEIRO">Goleiro</option>
                </Select>
              </Field>
              {feedback && <p className="rounded-md bg-muted px-3 py-2 text-sm text-slate-700">{feedback}</p>}
              <Button className="min-h-12" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={16} />}
                {saving ? 'Enviando...' : 'Entrar na lista'}
              </Button>
            </form>
          )}
        </Card>
      </AnimatedPage>
    </main>
  )
}
