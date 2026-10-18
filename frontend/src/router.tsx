import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { FullPageLoading } from '@/components/FullPageLoading'

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingComponent: FullPageLoading,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
