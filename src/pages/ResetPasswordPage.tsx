import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Eye, LoaderCircle, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/button'
import { SportBackground } from '../components/login/SportBackground'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/utils'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function prepareRecoverySession() {
      setMessage('')
      try {
        const url = new URL(window.location.href)
        const errorDescription = url.searchParams.get('error_description') || url.hash.match(/error_description=([^&]+)/)?.[1]
        if (errorDescription) throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, ' ')))

        const code = url.searchParams.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          window.history.replaceState({}, document.title, '/redefinir-senha')
        }

        const { data } = await supabase.auth.getSession()
        if (!active) return
        setValidSession(Boolean(data.session))
        if (!data.session) setMessage('Link expirado ou invalido. Solicite uma nova recuperacao de senha.')
      } catch (error) {
        if (!active) return
        setValidSession(false)
        setMessage(getErrorMessage(error, 'Nao foi possivel validar o link de recuperacao.'))
      } finally {
        if (active) setReady(true)
      }
    }

    prepareRecoverySession()
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setValidSession(Boolean(session))
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password.length < 6) {
      setMessage('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setMessage('As senhas nao conferem.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      setMessage('Senha atualizada com sucesso. Voce ja pode entrar com a nova senha.')
      await supabase.auth.signOut()
    } catch (error) {
      setMessage(getErrorMessage(error, 'Nao foi possivel atualizar a senha.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="login-arena min-h-screen overflow-x-hidden text-white">
      <SportBackground />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-xl items-center px-4 py-8">
        <motion.section
          className="login-card"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-12 place-items-center rounded-lg bg-green-100 text-green-800">
                {success ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black text-slate-950">Redefinir senha</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Crie uma nova senha para acessar o Agenda Sport.</p>
              </div>
            </div>
            <img src="/favicon.svg" alt="" className="size-10 rounded-lg" aria-hidden="true" />
          </div>

          {!ready && (
            <div className="grid place-items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              <LoaderCircle className="animate-spin text-green-700" size={28} />
              <p className="text-sm font-black">Validando link seguro...</p>
            </div>
          )}

          {ready && !validSession && !success && (
            <div className="grid gap-4">
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                {message || 'Link expirado ou invalido. Solicite uma nova recuperacao de senha.'}
              </p>
              <Button type="button" className="login-glow-button min-h-12 rounded-lg text-base" onClick={() => navigate('/login')}>
                Solicitar novo link
              </Button>
            </div>
          )}

          {ready && validSession && !success && (
            <form className="grid gap-4" onSubmit={submit}>
              <ResetInput
                label="Nova senha"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <ResetInput
                label="Confirmar nova senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
              {message && <p className="rounded-lg border border-yellow-100 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-900">{message}</p>}
              <Button className="login-glow-button min-h-12 rounded-lg text-base" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={16} />}
                {saving ? 'Atualizando...' : 'Atualizar senha'}
              </Button>
            </form>
          )}

          {success && (
            <div className="grid gap-4 text-center">
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 size={42} />
              </div>
              <p className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">{message}</p>
              <Button asChild className="login-glow-button min-h-12 rounded-lg text-base">
                <Link to="/login">Entrar com nova senha</Link>
              </Button>
            </div>
          )}
        </motion.section>
      </div>
    </main>
  )
}

function ResetInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      <span className="login-input-shell">
        <span className="text-slate-400"><Lock size={18} /></span>
        <input
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          type="password"
          required
          minLength={6}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-slate-300" aria-hidden="true"><Eye size={17} /></span>
      </span>
    </label>
  )
}
