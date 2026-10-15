import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { AppSidebar } from '@/components/AppSidebar'
import { SiteHeader } from '@/components/SiteHeader'
import { useLiveUpdates } from '@/hooks/use-live-updates'

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const liveConnected = useLiveUpdates()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-svh w-full bg-sidebar">
      <AppSidebar
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        liveConnected={liveConnected}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className="relative flex min-w-0 flex-1 flex-col bg-background md:m-2 md:ml-0 md:rounded-xl md:border md:shadow-sm">
        <SiteHeader
          liveConnected={liveConnected}
          onOpenMobile={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((value) => !value)}
        />
        <div className="@container/main flex flex-1 flex-col">{children}</div>
      </main>
    </div>
  )
}
