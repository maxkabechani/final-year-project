import type { PropsWithChildren } from 'react'
import { FullPageLoading } from '@/components/FullPageLoading'
import { authClient } from '@/lib/auth-client'
import { LoginPage } from '@/components/LoginPage'

export function AuthGate({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <FullPageLoading />
  }

  if (!session) return <LoginPage />

  const role = (session.user as { role?: string }).role
  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="grid min-h-svh place-items-center bg-sidebar p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Administrator access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account cannot access the Smart Access dashboard.
          </p>
        </div>
      </div>
    )
  }

  return children
}
