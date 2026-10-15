import { Link, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  BadgeCheck,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { useAdminConfig } from '../lib/config'

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/devices', label: 'Controllers', icon: DoorOpen },
  { to: '/access', label: 'Access', icon: UsersRound },
  { to: '/events', label: 'Activity', icon: Activity },
] as const

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { configured } = useAdminConfig()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div>
            <strong>CL3 Access</strong>
            <span>Control centre</span>
          </div>
        </div>

        <nav className="side-nav">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link key={to} to={to} className={active ? 'nav-item active' : 'nav-item'}>
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className={configured ? 'connection good' : 'connection'}>
            <span className="status-dot" />
            <div>
              <strong>{configured ? 'Admin configured' : 'Setup required'}</strong>
              <span>{configured ? 'API credentials stored locally' : 'Add API URL and token'}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="eyebrow">University of Zambia · CL3 Laboratory</div>
            <h1>Smart access management</h1>
          </div>
          <div className="topbar-badges">
            <span className="soft-badge"><KeyRound size={14} /> BLE offline unlock</span>
            <span className="soft-badge"><BadgeCheck size={14} /> Timetable policy</span>
            <Link to="/settings" className="icon-button" aria-label="Settings">
              <Settings2 size={18} />
            </Link>
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  )
}
