import { Link, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAdminConfig } from '@/lib/config'
import { cn } from '@/lib/utils'

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/devices', label: 'Controllers', icon: DoorOpen },
  { to: '/access', label: 'Access', icon: UsersRound },
  { to: '/events', label: 'Activity', icon: Activity },
] as const

type AppSidebarProps = {
  mobileOpen: boolean
  collapsed: boolean
  onMobileClose: () => void
}

export function AppSidebar({
  mobileOpen,
  collapsed,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { configured } = useAdminConfig()

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        aria-label="Primary navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-svh w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:sticky md:top-0 md:z-20 md:translate-x-0 md:transition-[width]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-xs">
            <ShieldCheck className="size-4" />
          </div>
          <div className={cn('min-w-0 flex-1 leading-tight', collapsed && 'md:hidden')}>
            <div className="truncate text-sm font-semibold">CL3 Smart Access</div>
            <div className="truncate text-xs text-muted-foreground">Control centre</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close navigation"
            className="md:hidden"
            onClick={onMobileClose}
          >
            <X />
          </Button>
        </div>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
          <div className="space-y-1">
            <div className={cn('px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground', collapsed && 'md:hidden')}>
              Workspace
            </div>
            {mainNav.map(({ to, label, icon: Icon }) => {
              const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={onMobileClose}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                    collapsed && 'md:justify-center md:px-0',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn('truncate', collapsed && 'md:hidden')}>{label}</span>
                </Link>
              )
            })}
          </div>

          <div className="space-y-2">
            <div className={cn('px-2 text-xs font-medium text-muted-foreground', collapsed && 'md:hidden')}>
              Quick actions
            </div>
            <Link
              to="/access"
              onClick={onMobileClose}
              title={collapsed ? 'Grant access' : undefined}
              className={cn(
                buttonVariants({ size: 'sm' }),
                'w-full justify-start',
                collapsed && 'md:size-9 md:p-0 md:justify-center',
              )}
            >
              <UserRoundPlus />
              <span className={cn(collapsed && 'md:hidden')}>Grant access</span>
            </Link>
            <Link
              to="/devices"
              onClick={onMobileClose}
              title={collapsed ? 'Register controller' : undefined}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'w-full justify-start bg-sidebar',
                collapsed && 'md:size-9 md:p-0 md:justify-center',
              )}
            >
              <KeyRound />
              <span className={cn(collapsed && 'md:hidden')}>Register controller</span>
            </Link>
          </div>
        </div>

        <div className="space-y-2 border-t border-sidebar-border p-2">
          <Link
            to="/settings"
            onClick={onMobileClose}
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              pathname.startsWith('/settings') && 'bg-sidebar-accent text-sidebar-accent-foreground',
              collapsed && 'md:justify-center md:px-0',
            )}
          >
            <Settings2 className="size-4" />
            <span className={cn(collapsed && 'md:hidden')}>Settings</span>
          </Link>

          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border border-sidebar-border bg-background/60 p-2',
              collapsed && 'md:justify-center md:border-0 md:bg-transparent md:p-1',
            )}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                configured ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            />
            <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
              <div className="truncate text-xs font-medium">
                {configured ? 'API connected' : 'Setup required'}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {configured ? 'Administrator session ready' : 'Add API credentials'}
              </div>
            </div>
            {!collapsed && (
              <Badge variant="outline" className="hidden text-[10px] xl:inline-flex">
                {configured ? 'Ready' : 'Setup'}
              </Badge>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
