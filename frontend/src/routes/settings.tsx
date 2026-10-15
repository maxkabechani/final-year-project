import { createFileRoute } from '@tanstack/react-router'
import { ShieldPlus, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { useAdmins, useCreateAdmin } from '@/lib/queries'

export const Route = createFileRoute('/settings')({
  head: () => ({
    title: 'Administrators | Smart Access',
    meta: [
      { name: 'description', content: 'Manage Smart Access dashboard administrators.' },
      { property: 'og:title', content: 'Administrators | Smart Access' },
      { property: 'og:description', content: 'Manage Smart Access dashboard administrators.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const { data: session } = authClient.useSession()
  const admins = useAdmins()
  const createAdmin = useCreateAdmin()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isOwner = role === 'owner'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await createAdmin.mutateAsync({
      name: name.trim(),
      email: email.trim(),
      password,
    })
    setName('')
    setEmail('')
    setPassword('')
  }

  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Dashboard security"
        title="Administrators"
        description="Dashboard access is protected by Better Auth sessions. No shared administrator token is stored in the browser."
      />

      <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard administrators</CardTitle>
            <CardDescription>
              Owner and administrator accounts that can manage locks, people and access policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {admins.error ? (
              <PageError error={admins.error} />
            ) : (
              (admins.data ?? []).map((admin) => (
                <div key={admin.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                    <UserRound className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{admin.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{admin.email}</div>
                  </div>
                  <Badge variant={admin.role === 'owner' ? 'default' : 'outline'} className="capitalize">
                    {admin.role}
                  </Badge>
                </div>
              ))
            )}
            {!admins.isLoading && !admins.error && (admins.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No administrators found.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <div className="mb-2 grid size-9 place-items-center rounded-lg bg-muted">
              <ShieldPlus className="size-4" />
            </div>
            <CardTitle>{isOwner ? 'Add administrator' : 'Administrator account'}</CardTitle>
            <CardDescription>
              {isOwner
                ? 'Create another administrator who can register doors and grant or revoke access.'
                : 'Only the owner can create additional dashboard administrators.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOwner ? (
              <form className="space-y-4" onSubmit={submit}>
                <div className="grid gap-2">
                  <label htmlFor="new-admin-name" className="text-sm font-medium">Full name</label>
                  <Input id="new-admin-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="new-admin-email" className="text-sm font-medium">Email</label>
                  <Input id="new-admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="new-admin-password" className="text-sm font-medium">Temporary password</label>
                  <Input id="new-admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
                </div>
                <Button type="submit" disabled={createAdmin.isPending}>
                  <ShieldPlus />
                  {createAdmin.isPending ? 'Adding…' : 'Add administrator'}
                </Button>
                {createAdmin.error && <PageError error={createAdmin.error} />}
              </form>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{session?.user.name}</div>
                <div className="text-muted-foreground">{session?.user.email}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
