/// <reference types="vite/client" />

import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { AppShell } from '@/components/AppShell'
import { AuthGate } from '@/components/AuthGate'
import { Toaster } from '@/components/ui/sonner'
import { ConfigProvider } from '@/lib/config'
import appCss from '@/styles.css?url'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'description',
        content: 'Manage multiple BLE smart locks, people, access schedules and audit events.',
      },
      { name: 'application-name', content: 'Smart Access' },
      { name: 'theme-color', content: '#0a0a0a' },
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:site_name', content: 'Smart Access' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Smart Access' },
      {
        property: 'og:description',
        content: 'Manage multiple BLE smart locks, people, access schedules and audit events.',
      },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
    title: 'Smart Access',
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AuthGate>
            <AppShell>
              <Outlet />
            </AppShell>
          </AuthGate>
          <Toaster />
        </ConfigProvider>
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
