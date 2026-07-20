import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './components/layout/AppShell'
import { Button } from './components/ui/button'
import { ErrorBoundary } from './components/ui/error-boundary'
import { LoadingState } from './components/ui/sport'
import { getProfile } from './lib/data'
import { hasAnyModuleAccess, hasModuleAccess } from './lib/permissions'
import { supabase } from './lib/supabase'
import type { PermissionKey } from './lib/types'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { DrawPage } from './pages/DrawPage'
import { FinancePage } from './pages/FinancePage'
import { LoginPage } from './pages/LoginPage'
import { MatchStatsEntryPage } from './pages/MatchStatsEntryPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PickupsPage } from './pages/PickupsPage'
import { PlayersPage } from './pages/PlayersPage'
import { PortalPage } from './pages/PortalPage'
import { PublicRegistrationPage } from './pages/PublicRegistrationPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

function ProtectedApp() {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: Boolean(session),
    retry: 2,
  })
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('agendasport-theme') === 'dark')

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(error ? null : data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)

      if (!nextSession || event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey: ['profile'] })
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('agendasport-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  if (session === undefined) return <LoadingState label="Confirmando sua sessao..." />
  if (!session) return <Navigate to="/login" replace />
  if (profile.isLoading) return <LoadingState label="Carregando seu perfil..." />
  if (profile.isError) {
    return (
      <AccessError
        message="Sua sessao foi confirmada, mas nao foi possivel carregar o perfil."
        onRetry={() => profile.refetch()}
      />
    )
  }
  if (!profile.data) {
    return (
      <AccessError
        message="Seu acesso foi autenticado, mas o perfil da empresa nao foi encontrado."
        onRetry={() => profile.refetch()}
      />
    )
  }

  return <AppShell profile={profile.data} darkMode={darkMode} setDarkMode={setDarkMode} />
}

function AccessError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-lg">
        <h1 className="text-xl font-black text-slate-950">Nao foi possivel abrir o sistema</h1>
        <p className="mt-2 text-sm font-medium text-slate-600">{message}</p>
        <div className="mt-5 flex justify-center">
          <Button type="button" onClick={onRetry}>Tentar novamente</Button>
        </div>
      </section>
    </main>
  )
}

function TenantOnly({ children, permission, anyPermission }: { children: ReactNode; permission?: PermissionKey; anyPermission?: PermissionKey[] }) {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  if (profile.isLoading) return <LoadingState />
  if (profile.isError) return <LoadingState label="Nao foi possivel carregar os dados da empresa." />
  if (!profile.data) return <Navigate to="/login" replace />
  if (profile.data.role === 'SUPER_ADMIN' || !profile.data.tenant_id) return <Navigate to="/" replace />
  if (!hasModuleAccess(profile.data, permission)) return <Navigate to="/" replace />
  if (anyPermission?.length && !hasAnyModuleAccess(profile.data, anyPermission)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/portal" element={<PortalPage />} />
        <Route path="/inscricao/:token" element={<PublicRegistrationPage />} />
        <Route element={<ProtectedApp />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/participantes" element={<TenantOnly anyPermission={['players', 'suspensions']}><PlayersPage /></TenantOnly>} />
          <Route path="/eventos" element={<TenantOnly permission="confirmations"><PickupsPage /></TenantOnly>} />
          <Route path="/jogadores" element={<Navigate to="/participantes" replace />} />
          <Route path="/peladas" element={<Navigate to="/eventos" replace />} />
          <Route path="/agenda" element={<TenantOnly permission="confirmations"><SchedulePage /></TenantOnly>} />
          <Route path="/lancamento/:matchId" element={<TenantOnly permission="results"><MatchStatsEntryPage /></TenantOnly>} />
          <Route path="/sorteio" element={<TenantOnly permission="draw"><DrawPage /></TenantOnly>} />
          <Route path="/estatisticas" element={<TenantOnly permission="stats"><StatsPage /></TenantOnly>} />
          <Route path="/financeiro" element={<TenantOnly permission="finance"><FinancePage /></TenantOnly>} />
          <Route path="/configuracoes" element={<TenantOnly permission="settings"><SettingsPage /></TenantOnly>} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}
