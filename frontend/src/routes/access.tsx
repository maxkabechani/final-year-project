import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { dayMaskFromDate, daysLabel, grantState, minutesToTime, timeToMinutes, type AccessGrant, type AccessSchedule, type AccessType } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useAccessGrants, useDevices, useGrantAccess, usePeople, useRevokeGrant } from '@/lib/queries'

export const Route = createFileRoute('/access')({
  head: () => ({
    title: 'Access Control | Smart Access',
    meta: [
      { name: 'description', content: 'Grant recurring or one-off access to specific people for specific doors and rooms.' },
      { property: 'og:title', content: 'Access Control | Smart Access' },
      { property: 'og:description', content: 'Grant recurring or one-off access to specific people for specific doors and rooms.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AccessPage,
})

const dayOptions = [
  { value: '0', label: 'Mon' }, { value: '1', label: 'Tue' }, { value: '2', label: 'Wed' },
  { value: '3', label: 'Thu' }, { value: '4', label: 'Fri' }, { value: '5', label: 'Sat' }, { value: '6', label: 'Sun' },
]

function AccessPage() {
  const { configured } = useAdminConfig()
  const devices = useDevices()
  const people = usePeople()
  const grants = useAccessGrants()
  const grantAccess = useGrantAccess()
  const revoke = useRevokeGrant()

  const [personChoice, setPersonChoice] = useState('new')
  const [name, setName] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('recurring')
  const [selectedDays, setSelectedDays] = useState<string[]>(['0', '1', '2', '3', '4'])
  const [oneOffDate, setOneOffDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [credential, setCredential] = useState('')

  const columns = useMemo<ColumnDef<AccessGrant>[]>(() => [
    {
      accessorKey: 'personName', header: 'Person',
      cell: ({ row }) => <div><div className="font-medium">{row.original.personName}</div><code className="text-xs text-muted-foreground">{row.original.personId.slice(0, 8)}</code></div>,
    },
    {
      accessorKey: 'deviceName', header: 'Door / room',
      cell: ({ row }) => <div><div className="font-medium">{row.original.deviceName}</div><div className="text-xs text-muted-foreground">{row.original.location || row.original.deviceId}</div></div>,
    },
    {
      accessorKey: 'accessType', header: 'Access',
      cell: ({ row }) => <Badge variant="outline">{row.original.accessType === 'one_off' ? 'One-off' : 'Recurring'}</Badge>,
    },
    {
      id: 'schedule', header: 'Schedule',
      cell: ({ row }) => (
        <div>
          <div>{row.original.accessType === 'one_off' ? new Date(row.original.validFrom * 1000).toLocaleDateString() : daysLabel(row.original.daysMask)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">{minutesToTime(row.original.startMinute)}–{minutesToTime(row.original.endMinute)}</div>
        </div>
      ),
    },
    {
      id: 'state', header: 'Status',
      accessorFn: (grant) => grantState(grant),
      cell: ({ row }) => grantState(row.original) === 'active'
        ? <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Active</Badge>
        : <Badge variant="outline" className="text-muted-foreground">Expired</Badge>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Revoke access for ${row.original.personName}`} disabled={revoke.isPending} onClick={() => revoke.mutate(row.original.grantId)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
        </div>
      ),
    },
  ], [revoke])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const startMinute = timeToMinutes(startTime)
    const endMinute = timeToMinutes(endTime)

    if (startMinute >= endMinute) return toast.error('End time must be after start time')
    if (!deviceId) return toast.error('Select a smart lock')
    if (personChoice === 'new' && !name.trim()) return toast.error('Enter the person name')

    let schedule: AccessSchedule
    if (accessType === 'recurring') {
      if (selectedDays.length === 0) return toast.error('Select at least one day')
      const daysMask = selectedDays.reduce((mask, value) => mask | (1 << Number(value)), 0)
      schedule = { accessType: 'recurring', daysMask, startMinute, endMinute, validFrom: Math.floor(Date.now() / 1000), validUntil: null }
    } else {
      const start = new Date(`${oneOffDate}T${startTime}:00`)
      const end = new Date(`${oneOffDate}T${endTime}:00`)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return toast.error('Choose a valid one-off date and time window')
      schedule = { accessType: 'one_off', daysMask: dayMaskFromDate(start), startMinute, endMinute, validFrom: Math.floor(start.getTime() / 1000), validUntil: Math.floor(end.getTime() / 1000) }
    }

    const result = await grantAccess.mutateAsync({
      personId: personChoice === 'new' ? undefined : personChoice,
      name: personChoice === 'new' ? name.trim() : undefined,
      deviceId,
      schedule,
    })

    setCredential(JSON.stringify({ userId: result.personId, credentialKeyHex: result.credentialKeyHex, schedule: result.schedule, deviceId: result.deviceId }))
    if (personChoice === 'new') { setPersonChoice(result.personId); setName('') }
  }

  if (!configured) return <div className="p-4 lg:p-6"><Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection before managing access.</CardContent></Card></div>

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader eyebrow="Authorization policy" title="Grant access" description="Choose a person, choose the smart lock they can open, then set recurring days or a one-off time window." />

      <div className="grid gap-4 px-4 xl:grid-cols-[1fr_0.8fr] lg:px-6">
        <Card>
          <CardHeader><CardTitle>Access assignment</CardTitle><CardDescription>One person can be assigned to multiple doors with different schedules.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Person</label>
                <Select value={personChoice} onValueChange={setPersonChoice}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent><SelectItem value="new">+ Add a new person</SelectItem>{(people.data ?? []).map((person) => <SelectItem key={person.personId} value={person.personId}>{person.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {personChoice === 'new' && <div className="grid gap-2"><label htmlFor="person-name" className="text-sm font-medium">Person name</label><Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Student, staff member or visitor" maxLength={120} required /></div>}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Door / room</label>
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select smart lock" /></SelectTrigger>
                  <SelectContent>{(devices.data ?? []).map((device) => <SelectItem key={device.deviceId} value={device.deviceId}>{device.name}{device.location ? ` · ${device.location}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Access type</label>
                <Select value={accessType} onValueChange={(value) => setAccessType(value as AccessType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="recurring">Recurring schedule</SelectItem><SelectItem value="one_off">One-off access</SelectItem></SelectContent>
                </Select>
              </div>
              {accessType === 'recurring' ? (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Allowed days</label>
                  <ToggleGroup type="multiple" value={selectedDays} onValueChange={setSelectedDays} aria-label="Allowed days">
                    {dayOptions.map((day) => <ToggleGroupItem key={day.value} value={day.value} aria-label={day.label}>{day.label}</ToggleGroupItem>)}
                  </ToggleGroup>
                </div>
              ) : (
                <div className="grid gap-2"><label htmlFor="one-off-date" className="text-sm font-medium">Date</label><Input id="one-off-date" type="date" value={oneOffDate} onChange={(e) => setOneOffDate(e.target.value)} required /></div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><label htmlFor="start-time" className="text-sm font-medium">From</label><Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
                <div className="grid gap-2"><label htmlFor="end-time" className="text-sm font-medium">Until</label><Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
              </div>
              <Button type="submit" disabled={grantAccess.isPending}><UserPlus />{grantAccess.isPending ? 'Saving access…' : 'Grant access'}</Button>
              {grantAccess.error && <PageError error={grantAccess.error} />}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Phone credential</CardTitle><CardDescription>Import this credential into the Android app. The same identity can be authorized by every assigned smart lock.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {credential ? (
              <>
                <div className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3"><code className="break-all text-xs leading-5">{credential}</code></div>
                <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(credential); toast.success('Credential copied') }}><Copy />Copy credential JSON</Button>
              </>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"><KeyRound className="mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">No credential generated yet</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Grant access to generate the phone credential.</p></div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>People and lock assignments</CardTitle><CardDescription>{grants.data?.length ?? 0} access assignment(s).</CardDescription></CardHeader>
          <CardContent>
            {grants.error ? <PageError error={grants.error} /> : (
              <DataTable data={grants.data ?? []} columns={columns} emptyMessage={grants.isLoading ? 'Loading access grants…' : 'No access has been assigned yet.'} filterPlaceholder="Search people, rooms or schedules…" />
            )}
            {revoke.error && <div className="mt-4"><PageError error={revoke.error} /></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
