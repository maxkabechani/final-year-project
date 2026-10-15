import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AccessActivityChart } from '@/components/AccessActivityChart'
import { DataTable } from '@/components/DataTable'
import { DevicePicker } from '@/components/DevicePicker'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { SectionCards } from '@/components/SectionCards'
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
import { useDevices, useEvents, useUsers } from '@/lib/queries'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const devices = useDevices()
  const users = useUsers(deviceId)
  const events = useEvents(deviceId)

  const columns = useMemo<ColumnDef<AccessEvent>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        header: 'Time',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground">
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
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Card className="w-full max-w-2xl bg-gradient-to-br from-primary/8 via-card to-card">
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <CardTitle className="text-xl">Connect the dashboard to the CL3 API</CardTitle>
            <CardDescription className="max-w-xl">
              Add the deployed Fastify API URL and administrator token. The dashboard will then
              load controllers, access policies and audit events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings">
                Configure connection <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (devices.error) {
    return (
      <div className="p-4 lg:p-6">
        <PageError error={devices.error} />
      </div>
    )
  }

  const eventData = events.data ?? []
  const granted = deviceId ? eventData.filter((event) => event.type === 'granted').length : null
  const denied = deviceId ? eventData.filter((event) => event.type === 'denied').length : null

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="System overview"
        title="Smart access dashboard"
        description="A live view of controllers, active credentials and door access decisions."
        action={<DevicePicker value={deviceId} onChange={setDeviceId} />}
      />

      <SectionCards
        controllers={devices.data?.length ?? 0}
        activeUsers={deviceId ? users.data?.length ?? 0 : null}
        granted={granted}
        denied={denied}
      />

      <div className="px-4 lg:px-6">
        <AccessActivityChart events={eventData} />
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Latest controller events. The device continues authorizing enrolled users locally
              when the network is unavailable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!deviceId ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a controller to view its activity.
              </div>
            ) : events.error ? (
              <PageError error={events.error} />
            ) : (
              <DataTable
                data={eventData}
                columns={columns}
                emptyMessage={events.isLoading ? 'Loading activity…' : 'No controller events yet.'}
                filterPlaceholder="Search activity…"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
