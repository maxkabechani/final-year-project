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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { AccessEvent } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useEvents } from '@/lib/queries'

export const Route = createFileRoute('/events')({
  component: EventsPage,
})

function EventsPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const events = useEvents(deviceId)

  const columns = useMemo<ColumnDef<AccessEvent>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        header: 'Time',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {new Date(String(getValue())).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Event',
        cell: ({ getValue }) => {
          const type = String(getValue())
          return (
            <Badge
              variant={type === 'denied' ? 'destructive' : type === 'granted' ? 'secondary' : 'outline'}
              className="capitalize"
            >
              {type.replaceAll('_', ' ')}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'userId',
        header: 'User',
        cell: ({ getValue }) => {
          const value = getValue()
          return value ? <code className="text-xs">{String(value).slice(0, 8)}</code> : '—'
        },
      },
      {
        accessorKey: 'detail',
        header: 'Detail',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{String(getValue() || '—')}</span>
        ),
      },
    ],
    [],
  )

  if (!configured) {
    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Configure the API connection in Settings before viewing audit events.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Door activity"
        description="Granted, denied, enrollment and physical door events uploaded by the selected controller."
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <DevicePicker value={deviceId} onChange={setDeviceId} />
            <Button
              type="button"
              variant="outline"
              disabled={!deviceId || events.isFetching}
              onClick={() => events.refetch()}
            >
              <RefreshCw className={events.isFetching ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Controller events</CardTitle>
            <CardDescription>Latest 200 uploaded audit events for this controller.</CardDescription>
          </CardHeader>
          <CardContent>
            {!deviceId ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a controller to view its audit trail.
              </div>
            ) : events.error ? (
              <PageError error={events.error} />
            ) : (
              <DataTable
                data={events.data ?? []}
                columns={columns}
                emptyMessage={events.isLoading ? 'Loading events…' : 'No events have been uploaded by this controller yet.'}
                filterPlaceholder="Search audit events…"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
