import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { AppSidebar } from '@/components/AppSidebar'
import { SiteHeader } from '@/components/SiteHeader'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
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
    <SidebarProvider>
      <AppSidebar
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        liveConnected={liveConnected}
        onMobileClose={() => setMobileOpen(false)}
      />
      <SidebarInset>
        <SiteHeader
          liveConnected={liveConnected}
          onOpenMobile={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((value) => !value)}
        />
        <div className="@container/main flex min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
