import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/error-boundary'
import { LoadingState } from './components/ui/sport'
import { getProfile } from './lib/data'
import { hasModuleAccess } from './lib/permissions'
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
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('agendasport-theme') === 'dark')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session))
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setHasSession(Boolean(session)))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('agendasport-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  if (!ready || profile.isLoading) return <LoadingState />
  if (!hasSession) return <Navigate to="/login" replace />
  if (profile.isError) {
    return <LoadingState label="Nao foi possivel carregar seu perfil. Recarregue a pagina." />
  }
  if (!profile.data) return <Navigate to="/login" replace />

  return <AppShell profile={profile.data} darkMode={darkMode} setDarkMode={setDarkMode} />
}

function TenantOnly({ children, permission }: { children: ReactNode; permission?: PermissionKey }) {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  if (profile.isLoading) return <LoadingState />
  if (profile.isError) return <LoadingState label="Nao foi possivel carregar os dados da empresa." />
  if (!profile.data) return <Navigate to="/login" replace />
  if (profile.data.role === 'SUPER_ADMIN' || !profile.data.tenant_id) return <Navigate to="/" replace />
  if (!hasModuleAccess(profile.data, permission)) return <Navigate to="/" replace />
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
          <Route path="/participantes" element={<TenantOnly permission="confirmations"><PlayersPage /></TenantOnly>} />
          <Route path="/eventos" element={<TenantOnly permission="confirmations"><PickupsPage /></TenantOnly>} />
          <Route path="/jogadores" element={<Navigate to="/participantes" replace />} />
          <Route path="/peladas" element={<Navigate to="/eventos" replace />} />
          <Route path="/agenda" element={<TenantOnly permission="confirmations"><SchedulePage /></TenantOnly>} />
          <Route path="/lancamento/:matchId" element={<TenantOnly permission="stats"><MatchStatsEntryPage /></TenantOnly>} />
          <Route path="/sorteio" element={<TenantOnly permission="stats"><DrawPage /></TenantOnly>} />
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
