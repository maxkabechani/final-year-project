import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '@/components/DataTable'
import { DevicePicker } from '@/components/DevicePicker'
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
import {
  daysLabel,
  minutesToTime,
  timeToMinutes,
  type AccessUser,
} from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useCreateUser, useRevokeUser, useUsers } from '@/lib/queries'

export const Route = createFileRoute('/access')({
  component: AccessPage,
})

function AccessPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const [name, setName] = useState('')
  const [daysMask, setDaysMask] = useState(31)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [credential, setCredential] = useState('')

  const users = useUsers(deviceId)
  const createUser = useCreateUser(deviceId)
  const revoke = useRevokeUser(deviceId)

  const columns = useMemo<ColumnDef<AccessUser>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {row.original.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{row.original.name}</div>
              <code className="text-xs text-muted-foreground">{row.original.userId.slice(0, 8)}</code>
            </div>
          </div>
        ),
      },
      {
        id: 'days',
        header: 'Allowed days',
        accessorFn: (user) => daysLabel(user.schedule.daysMask),
        cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
      },
      {
        id: 'hours',
        header: 'Time window',
        accessorFn: (user) =>
          `${minutesToTime(user.schedule.startMinute)}–${minutesToTime(user.schedule.endMinute)}`,
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Revoke access for ${row.original.name}`}
              title="Revoke access"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(row.original.userId)}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [revoke],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const startMinute = timeToMinutes(startTime)
    const endMinute = timeToMinutes(endTime)

    if (startMinute >= endMinute) return

    const result = await createUser.mutateAsync({
      name: name.trim(),
      schedule: {
        daysMask,
        startMinute,
        endMinute,
        validFrom: Math.floor(Date.now() / 1000),
        validUntil: null,
      },
    })

    setCredential(
      JSON.stringify({
        userId: result.userId,
        credentialKeyHex: result.credentialKeyHex,
        schedule: result.schedule,
      }),
    )
    setName('')
  }

  if (!configured) {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Configure the API connection in Settings before managing access.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Authorization policy"
        title="Access control"
        description="Issue timetable-bound credentials and revoke access without changing the offline BLE unlock flow."
        action={<DevicePicker value={deviceId} onChange={setDeviceId} />}
      />

      <div className="grid gap-4 px-4 lg:grid-cols-[0.9fr_1.1fr] lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Grant access</CardTitle>
            <CardDescription>Create a credential for a student or staff member.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-2">
                <label htmlFor="user-name" className="text-sm font-medium">User name</label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Student or staff member"
                  maxLength={120}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="allowed-days" className="text-sm font-medium">Allowed days</label>
                <select
                  id="allowed-days"
                  value={daysMask}
                  onChange={(event) => setDaysMask(Number(event.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                  <option value={31}>Monday to Friday</option>
                  <option value={127}>Every day</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={4}>Wednesday</option>
                  <option value={8}>Thursday</option>
                  <option value={16}>Friday</option>
                  <option value={32}>Saturday</option>
                  <option value={64}>Sunday</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label htmlFor="start-time" className="text-sm font-medium">From</label>
                  <Input id="start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="end-time" className="text-sm font-medium">Until</label>
                  <Input id="end-time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </div>
              </div>

              <Button type="submit" disabled={!deviceId || createUser.isPending}>
                <UserPlus />
                {createUser.isPending ? 'Creating…' : 'Create credential'}
              </Button>

              {createUser.error && <PageError error={createUser.error} />}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phone credential</CardTitle>
            <CardDescription>
              Import this private JSON into the Android app for the user you just created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {credential ? (
              <>
                <div className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3">
                  <code className="break-all text-xs leading-5">{credential}</code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(credential)}
                >
                  <Copy />
                  Copy credential JSON
                </Button>
              </>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <KeyRound className="mb-3 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No credential generated yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Select a controller and create an access user to generate the phone credential.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Active access users</CardTitle>
            <CardDescription>
              {deviceId ? `${users.data?.length ?? 0} active credential(s) on this controller.` : 'Select a controller to manage its users.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!deviceId ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a controller to manage access.
              </div>
            ) : users.error ? (
              <PageError error={users.error} />
            ) : (
              <DataTable
                data={users.data ?? []}
                columns={columns}
                emptyMessage={users.isLoading ? 'Loading access users…' : 'No active users for this controller.'}
                filterPlaceholder="Search access users…"
              />
            )}
            {revoke.error && <div className="mt-4"><PageError error={revoke.error} /></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
