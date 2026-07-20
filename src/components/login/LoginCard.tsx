import { motion } from 'framer-motion'
import { CalendarCheck, Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui/button'

type LoginMode = 'login' | 'signup' | 'recover'

type LoginCardProps = {
  mode: LoginMode
  setMode: (mode: LoginMode) => void
  fullName: string
  setFullName: (value: string) => void
  email: string
  setEmail: (value: string) => void
  password: string
  setPassword: (value: string) => void
  message: string
  messageType: 'success' | 'error'
  loading: boolean
  submit: (event: FormEvent<HTMLFormElement>) => void
}

const modeCopy: Record<LoginMode, { title: string; subtitle: string; action: string }> = {
  login: {
    title: 'Entrar na plataforma',
    subtitle: 'Acesse sua agenda, participantes, equipes e financeiro.',
    action: 'Entrar',
  },
  signup: {
    title: 'Criar acesso',
    subtitle: 'Cadastre o responsavel para iniciar a organizacao.',
    action: 'Cadastrar',
  },
  recover: {
    title: 'Recuperar senha',
    subtitle: 'Receba um link seguro pelo email cadastrado.',
    action: 'Enviar link',
  },
}

export function LoginCard({
  mode,
  setMode,
  fullName,
  setFullName,
  email,
  setEmail,
  password,
  setPassword,
  message,
  messageType,
  loading,
  submit,
}: LoginCardProps) {
  const Icon = mode === 'signup' ? UserPlus : mode === 'recover' ? Lock : CalendarCheck
  const copy = modeCopy[mode]

  return (
    <motion.section
      className="login-card"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 place-items-center rounded-lg bg-green-100 text-green-800">
            <Icon size={21} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-slate-950">{copy.title}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{copy.subtitle}</p>
          </div>
        </div>
        <img src="/favicon.svg" alt="" className="size-10 rounded-lg" aria-hidden="true" />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
        <ModeButton active={mode === 'login'} onClick={() => setMode('login')}>Login</ModeButton>
        <ModeButton active={mode === 'signup'} onClick={() => setMode('signup')}>Cadastro</ModeButton>
        <ModeButton active={mode === 'recover'} onClick={() => setMode('recover')}>Senha</ModeButton>
      </div>

      <form className="grid gap-4" onSubmit={submit}>
        {mode === 'signup' && (
          <LoginInput
            label="Nome completo"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={setFullName}
            icon={<UserPlus size={18} />}
            required
          />
        )}

        <LoginInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          icon={<Mail size={18} />}
          required
        />

        {mode !== 'recover' && (
          <LoginInput
            label="Senha"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={setPassword}
            icon={<Lock size={18} />}
            minLength={6}
            required
          />
        )}

        {message && (
          <p
            aria-live="polite"
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              messageType === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-green-100 bg-green-50 text-green-900'
            }`}
          >
            {message}
          </p>
        )}

        <Button type="submit" className="login-glow-button min-h-12 rounded-lg text-base" disabled={loading}>
          {loading ? 'Processando...' : copy.action}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="login-card-link" onClick={() => setMode('login')}>Login</button>
        <button type="button" className="login-card-link" onClick={() => setMode('signup')}>Cadastro</button>
        <button type="button" className="login-card-link" onClick={() => setMode('recover')}>Recuperar senha</button>
        <Link className="login-card-link" to="/portal">Portal do participante</Link>
      </div>
    </motion.section>
  )
}

function ModeButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`relative min-h-10 rounded-md text-sm font-black transition ${active ? 'text-white' : 'text-slate-500 hover:text-slate-950'}`}
      onClick={onClick}
    >
      {active && <motion.span layoutId="login-mode-pill" className="absolute inset-0 rounded-md bg-slate-950 shadow-sm" transition={{ duration: 0.2 }} />}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

function LoginInput({
  label,
  name,
  value,
  onChange,
  icon,
  type = 'text',
  required,
  minLength,
  autoComplete,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  icon: ReactNode
  type?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
}) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      <span className="login-input-shell">
        <span className="text-slate-400">{icon}</span>
        <input
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          name={name}
          type={isPassword && showPassword ? 'text' : type}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="grid size-9 place-items-center text-slate-400 transition hover:text-slate-700"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </span>
    </label>
  )
}
