import { Link, useRouterState } from '@tanstack/react-router'
import { Menu, PanelLeft, Settings2, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAdminConfig } from '@/lib/config'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/devices': 'Controllers',
  '/access': 'Access control',
  '/events': 'Activity',
  '/settings': 'Settings',
}

type SiteHeaderProps = {
  onOpenMobile: () => void
  onToggleCollapse: () => void
}

export function SiteHeader({ onOpenMobile, onToggleCollapse }: SiteHeaderProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { configured } = useAdminConfig()
  const title = titles[pathname] ?? 'CL3 Smart Access'

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
          University of Zambia · CL3 Laboratory
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
          <ShieldCheck className="size-3" />
          BLE offline access
        </Badge>
        <Badge variant={configured ? 'secondary' : 'outline'} className="hidden md:inline-flex">
          {configured ? 'API connected' : 'Setup required'}
        </Badge>
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/settings" aria-label="Open settings">
            <Settings2 />
          </Link>
        </Button>
      </div>
    </header>
  )
}
