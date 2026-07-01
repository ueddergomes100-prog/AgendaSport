import { motion } from 'framer-motion'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FloatingMatchCards, MatchStatusCard } from '../components/login/FloatingMatchCards'
import { LoginCard } from '../components/login/LoginCard'
import { SportBackground } from '../components/login/SportBackground'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/utils'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`
}

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup' | 'recover'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMessage('Enviamos o link de recuperacao para o email informado.')
        return
      }
      if (mode === 'signup') {
        const response = await fetch(apiUrl('/api/onboarding/signup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Nao foi possivel criar o cadastro.')

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/')
    } catch (error) {
      setMessage(getErrorMessage(error, 'Nao foi possivel concluir a operacao.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-arena min-h-screen overflow-x-hidden text-white">
      <SportBackground />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,0.92fr)] lg:px-8">
        <section className="hidden min-w-0 lg:block">
          <motion.div
            className="mb-7 flex items-center gap-4"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="login-logo-shell">
              <img src="/agendasport.svg" alt="Agenda Sport" className="size-16 rounded-xl" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.26em] text-yellow-300">Agenda Sport</p>
              <p className="mt-1 text-sm font-semibold text-white/62">Arena digital para eventos, equipes e campeonatos</p>
            </div>
          </motion.div>

          <MatchStatusCard />

          <motion.div
            className="mt-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.26, duration: 0.45 }}
          >
            <FloatingMatchCards />
          </motion.div>
        </section>

        <section className="mx-auto grid w-full max-w-[480px] gap-5 lg:mx-0 lg:justify-self-end">
          <motion.div
            className="flex items-center justify-center gap-3 lg:hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <img src="/agendasport.svg" alt="Agenda Sport" className="size-14 rounded-xl shadow-xl shadow-black/25" />
            <div>
              <h1 className="text-3xl font-black">Agenda Sport</h1>
              <p className="text-sm font-semibold text-white/65">Organize seus eventos como um profissional.</p>
            </div>
          </motion.div>

          <LoginCard
            mode={mode}
            setMode={setMode}
            fullName={fullName}
            setFullName={setFullName}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            message={message}
            loading={loading}
            submit={submit}
          />

          <p className="text-center text-xs font-semibold leading-5 text-white/52">
            Controle agenda, presenca, equipes, financeiro e portal do participante sem perder a velocidade do dia do evento.
          </p>
        </section>
      </div>
    </main>
  )
}
