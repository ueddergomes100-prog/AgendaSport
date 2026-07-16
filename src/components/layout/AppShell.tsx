import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Copy,
  Dumbbell,
  Goal,
  LogOut,
  Moon,
  Shield,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { hasModuleAccess } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import type { PermissionKey, Profile } from '../../lib/types'
import { Button } from '../ui/button'
import { ParticleBackground } from './ParticleBackground'

type ShellNavItem = { to: string; label: string; icon: LucideIcon; permission?: PermissionKey }
type ShellNavGroup = { label: string; items: ShellNavItem[] }

const superAdminGroups: ShellNavGroup[] = [
  {
    label: 'Gestao da plataforma',
    items: [
      { to: '/', label: 'Visao geral', icon: ChartNoAxesCombined },
      { to: '/admin', label: 'Empresas e links', icon: Building2 },
    ],
  },
]

const tenantGroups: ShellNavGroup[] = [
  {
    label: 'Operacao',
    items: [
      { to: '/', label: 'Dashboard', icon: ChartNoAxesCombined },
      { to: '/participantes', label: 'Participantes', icon: Users, permission: 'confirmations' },
      { to: '/eventos', label: 'Eventos', icon: Dumbbell, permission: 'confirmations' },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays, permission: 'confirmations' },
      { to: '/sorteio', label: 'Sorteio', icon: Trophy, permission: 'stats' },
      { to: '/estatisticas', label: 'Estatisticas', icon: BarChart3, permission: 'stats' },
    ],
  },
  {
    label: 'Gestao',
    items: [
      { to: '/financeiro', label: 'Financeiro', icon: CircleDollarSign, permission: 'finance' },
      { to: '/configuracoes', label: 'Configuracoes', icon: Settings, permission: 'settings' },
    ],
  },
]

export function AppShell({ profile, darkMode, setDarkMode }: { profile: Profile; darkMode: boolean; setDarkMode: (value: boolean) => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const groups = profile.role === 'SUPER_ADMIN'
    ? superAdminGroups
    : tenantGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => hasModuleAccess(profile, item.permission)) }))
      .filter((group) => group.items.length)
  const navItems = groups.flatMap((group) => group.items)
  const mobileNavItems = navItems.slice(0, 5)
  const currentItem = navItems.find((item) => item.to === location.pathname) ?? navItems.find((item) => item.to === '/')
  const CurrentIcon = currentItem?.icon

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-frame shell-grid min-h-screen text-foreground dark:text-slate-100">
      <ParticleBackground />
      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="app-sidebar sticky top-0 z-30 hidden h-screen border-r border-border px-4 py-5 dark:border-slate-800 md:block"
      >
        <Link to="/" className="brand-lockup mb-6 flex items-center gap-3 px-2">
          <span className="brand-icon-wrap">
            <img src="/agendasport.svg" alt="Agenda Sport" className="size-11 rounded-lg" />
          </span>
          <span>
            <span className="block text-lg font-black leading-tight">Agenda Sport</span>
            <span className="text-xs font-medium text-muted-foreground">Eventos no controle</span>
          </span>
        </Link>

        <CommandPanel profile={profile} />

        <nav className="mt-5 grid gap-1">
          {groups.map((group, groupIndex) => (
            <motion.div
              key={group.label}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12 + groupIndex * 0.06 }}
            >
              <p className="nav-group-label">{group.label}</p>
              <div className="grid gap-1">
                {group.items.map((item) => (
                  <NavItem key={item.to} item={item} />
                ))}
              </div>
            </motion.div>
          ))}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-border bg-white/72 p-3 text-xs text-muted-foreground shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
          <div className="mb-2 flex items-center gap-2 font-bold text-foreground dark:text-slate-100">
            {profile.role === 'SUPER_ADMIN' ? <Shield size={15} /> : <Goal size={15} />}
            {profile.role === 'SUPER_ADMIN' ? 'Modo plataforma' : 'Modo empresa'}
          </div>
          {profile.role === 'SUPER_ADMIN' ? 'Tenants, planos e links publicos.' : 'Agenda, equipes, presenca e caixa.'}
        </div>
      </motion.aside>

      <main className="relative z-10 min-w-0 pb-24 md:pb-0">
        <header className="app-topbar sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border px-4 py-3 backdrop-blur-xl dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/favicon.svg" alt="Agenda Sport" className="size-9 rounded-lg sm:hidden" />
            {CurrentIcon && (
              <div className="hidden size-10 place-items-center rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100 sm:grid">
                <CurrentIcon size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{currentItem?.label ?? 'Agenda Sport'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile.role === 'SUPER_ADMIN' ? 'Administracao da plataforma' : `${profile.full_name} - ${profile.role}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile.role === 'SUPER_ADMIN' && (
              <Button asChild className="hidden sm:inline-flex">
                <Link to="/admin">
                  <Copy size={16} />
                  Links
                </Link>
              </Button>
            )}
            <Button variant="ghost" className="size-10 p-0" onClick={() => setDarkMode(!darkMode)} title="Alternar tema">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button variant="ghost" className="size-10 p-0" onClick={logout} title="Sair">
              <LogOut size={18} />
            </Button>
          </div>
        </header>

        <motion.div
          key={location.pathname}
          className="mx-auto max-w-7xl px-4 py-6"
          initial={{ y: 16, opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>

        <nav className="mobile-dock fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-lg border border-border bg-white/88 p-1 shadow-2xl shadow-slate-950/16 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/88 md:hidden">
          {mobileNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-nav-link ${isActive ? 'mobile-nav-link-active' : ''}`}>
                <Icon size={18} />
                <span>{item.label.split(' ')[0]}</span>
              </NavLink>
            )
          })}
        </nav>
      </main>
    </div>
  )
}

function NavItem({ item }: { item: ShellNavItem }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
      <motion.span className="flex w-full items-center gap-3" whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
        <Icon size={18} />
        <span>{item.label}</span>
      </motion.span>
    </NavLink>
  )
}

function CommandPanel({ profile }: { profile: Profile }) {
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const springX = useSpring(pointerX, { stiffness: 180, damping: 20 })
  const springY = useSpring(pointerY, { stiffness: 180, damping: 20 })
  const rotateY = useTransform(springX, [-0.5, 0.5], [-4, 4])
  const rotateX = useTransform(springY, [-0.5, 0.5], [4, -4])

  return (
    <motion.div
      className="command-panel rounded-lg p-3"
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5)
        pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5)
      }}
      onPointerLeave={() => {
        pointerX.set(0)
        pointerY.set(0)
      }}
      whileInView={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 10 }}
      viewport={{ once: true, margin: '-20px' }}
    >
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-primary">
        <Sparkles size={14} />
        {profile.role === 'SUPER_ADMIN' ? 'Setup rapido' : 'Dia do evento'}
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug">
        {profile.role === 'SUPER_ADMIN' ? 'Cadastre empresas, gere links e acompanhe o crescimento.' : 'Confirme participantes, monte equipes e feche estatisticas.'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="mini-meter">
          <Zap size={15} />
          <span>WhatsApp</span>
        </div>
        <div className="mini-meter">
          <Trophy size={15} />
          <span>Sorteio</span>
        </div>
      </div>
    </motion.div>
  )
}
