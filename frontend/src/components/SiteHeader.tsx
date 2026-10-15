import { Link, useRouterState } from '@tanstack/react-router'
import { Menu, PanelLeft, Settings2, Wifi } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAdminConfig } from '@/lib/config'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/devices': 'Smart locks',
  '/people': 'People',
  '/access': 'Access control',
  '/events': 'Activity',
  '/settings': 'Settings',
}

type SiteHeaderProps = {
  liveConnected: boolean
  onOpenMobile: () => void
  onToggleCollapse: () => void
}

export function SiteHeader({
  liveConnected,
  onOpenMobile,
  onToggleCollapse,
}: SiteHeaderProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { configured } = useAdminConfig()
  const title = titles[pathname] ?? 'Smart Access'

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobile}
      >
        <Menu />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label="Toggle sidebar"
        onClick={onToggleCollapse}
      >
        <PanelLeft />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          Manage people, doors and time-based access
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {configured && liveConnected && (
          <Badge className="hidden gap-1.5 bg-emerald-500 text-white hover:bg-emerald-500 sm:inline-flex">
            <Wifi className="size-3" />
            Live
          </Badge>
        )}
        {configured && !liveConnected && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            API configured
          </Badge>
        )}
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/settings" aria-label="Open settings">
            <Settings2 />
          </Link>
        </Button>
      </div>
    </header>
  )
}
