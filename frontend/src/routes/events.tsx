import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/DataTable'
import { DevicePicker } from '@/components/DevicePicker'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessEvent } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useEvents } from '@/lib/queries'

export const Route = createFileRoute('/events')({
  head: () => ({
    title: 'Activity | Smart Access',
    meta: [
      { name: 'description', content: 'Review smart lock access events, granted and denied attempts, and controller audit activity.' },
      { property: 'og:title', content: 'Activity | Smart Access' },
      { property: 'og:description', content: 'Review smart lock access events, granted and denied attempts, and controller audit activity.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: EventsPage,
})

function EventsPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const events = useEvents(deviceId || undefined)

  const columns = useMemo<ColumnDef<AccessEvent>[]>(() => [
    {
      accessorKey: 'occurredAt', header: 'Time',
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{new Date(String(getValue())).toLocaleString()}</span>,
    },
    {
      accessorKey: 'deviceName', header: 'Smart lock',
      cell: ({ row }) => <div><div className="font-medium">{row.original.deviceName ?? row.original.deviceId ?? 'Unknown lock'}</div>{row.original.location && <div className="text-xs text-muted-foreground">{row.original.location}</div>}</div>,
    },
    {
      accessorKey: 'type', header: 'Event',
      cell: ({ getValue }) => {
        const type = String(getValue())
        return <Badge variant={type === 'denied' ? 'destructive' : 'outline'} className={type === 'granted' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' : 'capitalize'}>{type.replaceAll('_', ' ')}</Badge>
      },
    },
    {
      accessorKey: 'userName', header: 'Person',
      cell: ({ row }) => row.original.userName ?? (row.original.userId ? row.original.userId.slice(0, 8) : '—'),
    },
    {
      accessorKey: 'detail', header: 'Detail',
      cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() || '—')}</span>,
    },
  ], [])

  if (!configured) return <div className="p-4 lg:p-6"><Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection before viewing audit events.</CardContent></Card></div>

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Access activity"
        description="Granted, denied and enrollment events streamed from every smart lock."
        action={<div className="flex flex-col gap-2 sm:flex-row sm:items-end"><DevicePicker value={deviceId} onChange={setDeviceId} includeAll /><Button type="button" variant="outline" disabled={events.isFetching} onClick={() => events.refetch()}><RefreshCw className={events.isFetching ? 'animate-spin' : ''} />Refresh</Button></div>}
      />
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>Audit events</CardTitle><CardDescription>Latest 200 events for {deviceId ? 'the selected lock' : 'all smart locks'}.</CardDescription></CardHeader>
          <CardContent>
            {events.error ? <PageError error={events.error} /> : (
              <DataTable data={events.data ?? []} columns={columns} emptyMessage={events.isLoading ? 'Loading events…' : 'No access events have been uploaded yet.'} filterPlaceholder="Search events, people or locks…" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
