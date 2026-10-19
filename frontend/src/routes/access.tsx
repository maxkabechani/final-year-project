import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, Pencil, Smartphone, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { ConfirmAction } from '@/components/ConfirmAction'
import { SearchCombobox } from '@/components/SearchCombobox'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { dayMaskFromDate, daysLabel, grantState, minutesToTime, timeToMinutes, type AccessGrant, type AccessSchedule, type AccessType } from '@/lib/api'
import { accessDate, accessDateTime, accessTimestamp } from '@/lib/access-time'
import { useAdminConfig } from '@/lib/config'
import { useAccessGrants, useDevices, useGrantAccess, useManageResource, usePeople, useRevokeGrant } from '@/lib/queries'

export const Route = createFileRoute('/access')({
  head: () => ({
    title: 'Access Control | Smart Access',
    meta: [
      { name: 'description', content: 'Assign registered people recurring or one-off access to specific smart locks.' },
      { property: 'og:title', content: 'Access Control | Smart Access' },
      { property: 'og:description', content: 'Assign registered people recurring or one-off access to specific smart locks.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AccessPage,
})

const dayOptions = [
  { value: '0', label: 'Mon' },
  { value: '1', label: 'Tue' },
  { value: '2', label: 'Wed' },
  { value: '3', label: 'Thu' },
  { value: '4', label: 'Fri' },
  { value: '5', label: 'Sat' },
  { value: '6', label: 'Sun' },
]

function AccessPage() {
  const { configured } = useAdminConfig()
  const devices = useDevices()
  const people = usePeople()
  const grants = useAccessGrants()
  const grantAccess = useGrantAccess()
  const revoke = useRevokeGrant()
  const updateGrant = useManageResource('access-grants')
  const [editingGrantId, setEditingGrantId] = useState('')

  const [personId, setPersonId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('recurring')
  const [selectedDays, setSelectedDays] = useState<string[]>(['0', '1', '2', '3', '4'])
  const [oneOffDate, setOneOffDate] = useState(() => accessDate(new Date()))
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')

  const registeredPeople = people.data ?? []

  const personOptions = registeredPeople.map((person) => ({
    value: person.personId,
    label: person.name,
    description: person.studentNumber || person.personId.slice(0, 8),
    keywords: `${person.studentNumber ?? ''} ${person.personId}`,
  }))

  const deviceOptions = (devices.data ?? []).map((device) => ({
    value: device.deviceId,
    label: device.name,
    description: device.location || device.deviceId,
    keywords: `${device.deviceId} ${device.location}`,
  }))

  const columns = useMemo<ColumnDef<AccessGrant>[]>(() => [
    {
      accessorKey: 'personName',
      header: 'Person',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.personName}</div>
          <code className="text-xs text-muted-foreground">{row.original.personId.slice(0, 8)}</code>
        </div>
      ),
    },
    {
      accessorKey: 'deviceName',
      header: 'Door / room',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.deviceName}</div>
          <div className="text-xs text-muted-foreground">{row.original.location || row.original.deviceId}</div>
        </div>
      ),
    },
    {
      accessorKey: 'accessType',
      header: 'Access',
      cell: ({ row }) => <Badge variant="outline">{row.original.accessType === 'one_off' ? 'One-off' : 'Recurring'}</Badge>,
    },
    {
      id: 'schedule',
      header: 'Schedule',
      cell: ({ row }) => (
        <div>
          <div>{row.original.accessType === 'one_off' ? accessDate(new Date(row.original.validFrom * 1000)) : daysLabel(row.original.daysMask)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">{minutesToTime(row.original.startMinute)}–{minutesToTime(row.original.endMinute)}</div>
          {row.original.validFrom > 0 && <div className="text-xs tabular-nums text-muted-foreground">Starts {accessTimestamp(row.original.validFrom)} Zambia time</div>}
        </div>
      ),
    },
    {
      id: 'state',
      header: 'Status',
      accessorFn: (grant) => grantState(grant),
      cell: ({ row }) => grantState(row.original) === 'active'
        ? <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Active</Badge>
        : <Badge variant="outline" className="text-muted-foreground">{grantState(row.original) === 'scheduled' ? 'Starts later' : 'Expired'}</Badge>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" aria-label={`Edit access for ${row.original.personName}`} onClick={() => {
            const grant = row.original
            updateGrant.reset(); setEditingGrantId(grant.grantId); setPersonId(grant.personId); setDeviceId(grant.deviceId)
            setAccessType(grant.accessType); setStartTime(minutesToTime(grant.startMinute)); setEndTime(minutesToTime(grant.endMinute))
            setSelectedDays(dayOptions.filter(day => (grant.daysMask & (1 << Number(day.value))) !== 0).map(day => day.value))
            setOneOffDate(accessDate(grant.validFrom > 0 ? new Date(grant.validFrom * 1000) : new Date()))
            document.getElementById('access-assignment')?.scrollIntoView({ behavior: 'smooth' })
          }}><Pencil /> Edit</Button>
          <ConfirmAction name={`access for ${row.original.personName}`} label="Revoke" disabled={revoke.isPending}
            description="Remove this door assignment. Connected locks receive the change now; offline locks apply it after reconnecting."
            onConfirm={async () => { await revoke.mutateAsync(row.original.grantId); setEditingGrantId('') }} />
        </div>
      ),
    },
  ], [revoke, updateGrant.reset])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const startMinute = timeToMinutes(startTime)
    const endMinute = timeToMinutes(endTime)

    if (!personId) return toast.error('Select a registered person')
    if (!deviceId) return toast.error('Select a smart lock')
    if (startMinute >= endMinute) return toast.error('End time must be after start time')

    let schedule: AccessSchedule
    if (accessType === 'recurring') {
      if (selectedDays.length === 0) return toast.error('Select at least one day')
      const startDate = accessDateTime(oneOffDate, '00:00')
      if (Number.isNaN(startDate.getTime())) return toast.error('Choose a valid start date')
      const daysMask = selectedDays.reduce((mask, value) => mask | (1 << Number(value)), 0)
      schedule = {
        accessType: 'recurring',
        daysMask,
        startMinute,
        endMinute,
        validFrom: Math.floor(startDate.getTime() / 1000),
        validUntil: editingGrantId ? (grants.data?.find(grant => grant.grantId === editingGrantId && grant.accessType === 'recurring')?.validUntil ?? null) : null,
      }
    } else {
      const start = accessDateTime(oneOffDate, startTime)
      const end = accessDateTime(oneOffDate, endTime)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return toast.error('Choose a valid one-off date and time window')
      }
      schedule = {
        accessType: 'one_off',
        daysMask: dayMaskFromDate(start),
        startMinute,
        endMinute,
        validFrom: Math.floor(start.getTime() / 1000),
        validUntil: Math.floor(end.getTime() / 1000),
      }
    }

    if (editingGrantId) {
      try {
        await updateGrant.mutateAsync({ id: editingGrantId, method: 'PATCH', body: { schedule } })
        setEditingGrantId(''); setPersonId(''); setDeviceId('')
      } catch { /* Keep the API error visible in the form. */ }
    } else {
      try { await grantAccess.mutateAsync({ personId, deviceId, schedule }) }
      catch { /* Keep the API error visible in the form. */ }
    }
  }

  if (!configured) {
    return (
      <div className="p-4 lg:p-6">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection before managing access.</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Authorization policy"
        title="Grant access"
        description="Select a registered person, choose the door they can open, then set recurring days or a one-off time window."
      />

      <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_21.25rem]">
        <Card id="access-assignment">
          <CardHeader>
            <CardTitle>{editingGrantId ? 'Edit access assignment' : 'Access assignment'}</CardTitle>
            <CardDescription>All dates and times use Zambia time (UTC+02:00). Access starts at the From time and ends at the Until time.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium">Person</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={people.isFetching}
                    onClick={() => void people.refetch()}
                  >
                    {people.isFetching ? 'Refreshing…' : 'Refresh people'}
                  </Button>
                </div>
                <SearchCombobox
                  value={personId}
                  onValueChange={setPersonId}
                  options={personOptions}
                  placeholder={people.isLoading ? 'Loading people…' : 'Select person'}
                  searchPlaceholder="Search name or student number…"
                  emptyMessage={people.error ? 'Could not load people. Use Refresh people to retry.' : registeredPeople.length === 0 ? 'No people registered yet. Register in the Android app, then refresh.' : 'No matching people.'}
                  disabled={people.isLoading || Boolean(editingGrantId)}
                />
                {people.error ? (
                  <PageError error={people.error} />
                ) : !people.isLoading && registeredPeople.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No people registered yet. Register in the Android app, then refresh.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Door / room</label>
                <SearchCombobox
                  value={deviceId}
                  onValueChange={setDeviceId}
                  options={deviceOptions}
                  placeholder="Select smart lock"
                  searchPlaceholder="Search room, lock or location…"
                  emptyMessage="No matching smart locks."
                  disabled={deviceOptions.length === 0 || Boolean(editingGrantId)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Access type</label>
                <Select value={accessType} onValueChange={(value) => setAccessType(value as AccessType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">Recurring schedule</SelectItem>
                    <SelectItem value="one_off">One-off access</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {accessType === 'recurring' ? (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Allowed days</label>
                  <ToggleGroup type="multiple" value={selectedDays} onValueChange={setSelectedDays} aria-label="Allowed days">
                    {dayOptions.map((day) => <ToggleGroupItem key={day.value} value={day.value} aria-label={day.label}>{day.label}</ToggleGroupItem>)}
                  </ToggleGroup>
                </div>
              ) : null}

              <div className="grid gap-2">
                <label htmlFor="access-date" className="text-sm font-medium">{accessType === 'recurring' ? 'Start date' : 'Date'}</label>
                <Input id="access-date" type="date" value={oneOffDate} onChange={(e) => setOneOffDate(e.target.value)} required />
                {accessType === 'recurring' && <p className="text-xs text-muted-foreground">Access begins on this date in Zambia, during the selected days and hours. Saving replaces the previous start timestamp.</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label htmlFor="start-time" className="text-sm font-medium">From</label>
                  <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="end-time" className="text-sm font-medium">Until</label>
                  <Input id="end-time" type="time" value={endTime === '24:00' ? '00:00' : endTime} disabled={endTime === '24:00'} onChange={(e) => setEndTime(e.target.value)} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={endTime === '24:00'} onChange={event => setEndTime(event.target.checked ? '24:00' : '18:00')} />
                    Until midnight (end of day)
                  </label>
                </div>
              </div>

              <Button type="submit" disabled={grantAccess.isPending || updateGrant.isPending || !personId || !deviceId}>
                <UserPlus />
                {grantAccess.isPending || updateGrant.isPending ? 'Saving access…' : editingGrantId ? 'Save access' : 'Grant access'}
              </Button>
              {editingGrantId && <Button type="button" variant="outline" disabled={updateGrant.isPending} onClick={() => { setEditingGrantId(''); setPersonId(''); setDeviceId(''); updateGrant.reset() }}>Cancel edit</Button>}
              {updateGrant.error && <PageError error={updateGrant.error} />}
              {grantAccess.error && <PageError error={grantAccess.error} />}
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <div className="mb-2 grid size-9 place-items-center rounded-lg bg-muted"><Smartphone className="size-4" /></div>
            <CardTitle>Student identity</CardTitle>
            <CardDescription>
              Students register with their name and student/computer number. This dashboard decides which locks and schedules they can use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-2"><Badge variant="outline">1</Badge><span>Student registers their name and student/computer number.</span></div>
            <div className="flex gap-2"><Badge variant="outline">2</Badge><span>Choose the user and smart lock here.</span></div>
            <div className="flex gap-2"><Badge variant="outline">3</Badge><span>The app syncs permission automatically.</span></div>
            <div className="flex items-center gap-2 border-t pt-3 text-xs"><KeyRound className="size-4" /><span>No credential JSON needs to be copied.</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>People and lock assignments</CardTitle>
            <CardDescription>{grants.data?.length ?? 0} access assignment(s).</CardDescription>
          </CardHeader>
          <CardContent>
            {grants.error ? (
              <PageError error={grants.error} />
            ) : (
              <DataTable
                data={grants.data ?? []}
                columns={columns}
                emptyMessage={grants.isLoading ? 'Loading access grants…' : 'No access has been assigned yet.'}
                filterPlaceholder="Search people, rooms or schedules…"
              />
            )}
            {revoke.error && <div className="mt-4"><PageError error={revoke.error} /></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

