import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, DoorOpen, MoreHorizontal, Plus, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { Device } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useDevices, useRegisterDevice } from '@/lib/queries'

export const Route = createFileRoute('/devices')({
  head: () => ({
    title: 'Smart Locks | Smart Access',
    meta: [
      { name: 'description', content: 'Register and manage smart lock controllers, rooms, locations and device status.' },
      { property: 'og:title', content: 'Smart Locks | Smart Access' },
      { property: 'og:description', content: 'Register and manage smart lock controllers, rooms, locations and device status.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: DevicesPage,
})

function DevicesPage() {
  const { configured } = useAdminConfig()
  const devices = useDevices()
  const register = useRegisterDevice()
  const [deviceId, setDeviceId] = useState('front-door-01')
  const [name, setName] = useState('Front Door')
  const [location, setLocation] = useState('Main Building')
  const [newToken, setNewToken] = useState('')

  const columns = useMemo<ColumnDef<Device>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Smart lock',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-md bg-muted"><DoorOpen className="size-4" /></div>
          <div>
            <div className="font-medium">{row.original.name}</div>
            <code className="text-xs text-muted-foreground">{row.original.deviceId}</code>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'location',
      header: 'Room / location',
      cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() || '—')}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (device) => (device.online ? 'online' : 'offline'),
      cell: ({ row }) => row.original.online ? (
        <Badge className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-500">
          <span className="size-1.5 rounded-full bg-white" /> Online
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground" /> Offline
        </Badge>
      ),
    },
    {
      id: 'lastSeen',
      header: 'Last seen',
      accessorFn: (device) => device.lastSeenAt ?? '',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.lastSeenAt ? new Date(row.original.lastSeenAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Smart lock actions"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{row.original.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {
                void navigator.clipboard.writeText(row.original.deviceId)
                toast.success('Controller ID copied')
              }}>
                <Copy /> Copy controller ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await register.mutateAsync({ deviceId: deviceId.trim(), name: name.trim(), location: location.trim() })
    setNewToken(result.deviceToken)
  }

  if (!configured) {
    return <div className="p-4 lg:p-6"><Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection before registering smart locks.</CardContent></Card></div>
  }

  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader eyebrow="Hardware fleet" title="Smart locks" description="Register controllers and identify the room, door or area each one protects." />

      <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Card>
          <CardHeader><CardTitle>Register smart lock</CardTitle><CardDescription>Create the lock identity before flashing its API credentials.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-2"><label htmlFor="device-id" className="text-sm font-medium">Controller ID</label><Input id="device-id" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" required /></div>
              <div className="grid gap-2"><label htmlFor="device-name" className="text-sm font-medium">Door / lock name</label><Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></div>
              <div className="grid gap-2"><label htmlFor="device-location" className="text-sm font-medium">Room / location</label><Input id="device-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} placeholder="e.g. Server room, Block A" /></div>
              <Button type="submit" disabled={register.isPending}><Plus />{register.isPending ? 'Registering…' : 'Register smart lock'}</Button>
              {register.error && <PageError error={register.error} />}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>One-time controller token</CardTitle><CardDescription>Copy this secret into the firmware configuration. It is returned only once.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {newToken ? (
              <>
                <div className="rounded-lg border bg-muted/40 p-3"><code className="break-all text-xs">{newToken}</code></div>
                <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(newToken); toast.success('Device token copied') }}><Copy />Copy token</Button>
              </>
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                <ShieldCheck className="mb-3 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No new token yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Register a smart lock and its token will appear here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>Registered smart locks</CardTitle><CardDescription>{devices.data?.length ?? 0} lock(s) available.</CardDescription></CardHeader>
          <CardContent>
            {devices.error ? <PageError error={devices.error} /> : (
              <DataTable data={devices.data ?? []} columns={columns} emptyMessage={devices.isLoading ? 'Loading smart locks…' : 'No smart locks registered yet.'} filterPlaceholder="Search locks, rooms or IDs…" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
