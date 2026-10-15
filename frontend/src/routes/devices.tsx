import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, DoorOpen, Plus, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '@/components/DataTable'
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
import type { Device } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useDevices, useRegisterDevice } from '@/lib/queries'

export const Route = createFileRoute('/devices')({
  component: DevicesPage,
})

function DevicesPage() {
  const { configured } = useAdminConfig()
  const devices = useDevices()
  const register = useRegisterDevice()
  const [deviceId, setDeviceId] = useState('cl3-door-01')
  const [name, setName] = useState('CL3 Laboratory Door')
  const [newToken, setNewToken] = useState('')

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Controller',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <DoorOpen className="size-4" />
            </div>
            <div>
              <div className="font-medium">{row.original.name}</div>
              <code className="text-xs text-muted-foreground">{row.original.deviceId}</code>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Registered',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {new Date(String(getValue())).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: () => (
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Registered
          </Badge>
        ),
      },
    ],
    [],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await register.mutateAsync({
      deviceId: deviceId.trim(),
      name: name.trim(),
    })
    setNewToken(result.deviceToken)
  }

  if (!configured) {
    return <SetupPrompt />
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Hardware fleet"
        title="Controllers"
        description="Register ESP32 controllers and provision the one-time API token used for synchronization."
      />

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Register controller</CardTitle>
            <CardDescription>Create a controller identity before flashing its API credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-2">
                <label htmlFor="device-id" className="text-sm font-medium">Controller ID</label>
                <Input
                  id="device-id"
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  minLength={3}
                  maxLength={20}
                  pattern="[A-Za-z0-9._-]+"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="device-name" className="text-sm font-medium">Display name</label>
                <Input
                  id="device-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" disabled={register.isPending}>
                <Plus />
                {register.isPending ? 'Registering…' : 'Register controller'}
              </Button>
              {register.error && <PageError error={register.error} />}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>One-time controller token</CardTitle>
            <CardDescription>
              This secret is only returned when the controller is registered. Copy it into the
              ESP32 configuration before leaving this screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {newToken ? (
              <>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <code className="break-all text-xs">{newToken}</code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(newToken)}
                >
                  <Copy />
                  Copy token
                </Button>
              </>
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                <ShieldCheck className="mb-3 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No new token yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Register a controller and its token will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Registered controllers</CardTitle>
            <CardDescription>{devices.data?.length ?? 0} controller(s) available.</CardDescription>
          </CardHeader>
          <CardContent>
            {devices.error ? (
              <PageError error={devices.error} />
            ) : (
              <DataTable
                data={devices.data ?? []}
                columns={columns}
                emptyMessage={devices.isLoading ? 'Loading controllers…' : 'No controllers registered yet.'}
                filterPlaceholder="Search controllers…"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SetupPrompt() {
  return (
    <div className="p-4 lg:p-6">
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Configure the API URL and administrator token in Settings before registering controllers.
        </CardContent>
      </Card>
    </div>
  )
}
