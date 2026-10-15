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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessEvent } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { useAccessGrants, useDevices, useEvents, usePeople } from '@/lib/queries'

export const Route = createFileRoute('/')({ component: OverviewPage })

function OverviewPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const devices = useDevices()
  const people = usePeople()
  const grants = useAccessGrants()
  const events = useEvents(deviceId || undefined)

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
        accessorKey: 'deviceName',
        header: 'Smart lock',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.deviceName ?? row.original.deviceId ?? 'Unknown lock'}</div>
            {row.original.location && <div className="text-xs text-muted-foreground">{row.original.location}</div>}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Event',
        cell: ({ getValue }) => {
          const type = String(getValue())
          return (
            <Badge
              variant={type === 'denied' ? 'destructive' : 'outline'}
              className={
                type === 'granted'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'capitalize'
              }
            >
              {type.replaceAll('_', ' ')}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'userName',
        header: 'Person',
        cell: ({ row }) => row.original.userName ?? (row.original.userId ? row.original.userId.slice(0, 8) : '—'),
      },
      {
        accessorKey: 'detail',
        header: 'Detail',
        cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() || '—')}</span>,
      },
    ],
    [],
  )

  if (!configured) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Card className="w-full max-w-2xl bg-gradient-to-br from-muted/80 via-card to-card">
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <CardTitle className="text-xl">Connect the dashboard to the Smart Access API</CardTitle>
            <CardDescription className="max-w-xl">
              Add the Fastify API URL and administrator token to manage smart locks, people, policies and audit events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings">Configure connection <ArrowRight /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (devices.error) return <div className="p-4 lg:p-6"><PageError error={devices.error} /></div>

  const deviceData = devices.data ?? []
  const now = Math.floor(Date.now() / 1000)

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="System overview"
        title="Smart access dashboard"
        description="Manage multiple smart locks, people and time-based access from one place."
        action={<DevicePicker value={deviceId} onChange={setDeviceId} includeAll />}
      />

      <SectionCards
        totalLocks={deviceData.length}
        onlineLocks={deviceData.filter((device) => device.online).length}
        people={people.data?.length ?? 0}
        grants={grants.data?.filter((grant) => grant.validUntil === null || grant.validUntil > now).length ?? 0}
      />

      <div className="px-4 lg:px-6">
        <AccessActivityChart events={events.data ?? []} />
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Live audit events from {deviceId ? 'the selected smart lock' : 'all smart locks'}.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.error ? (
              <PageError error={events.error} />
            ) : (
              <DataTable
                data={events.data ?? []}
                columns={columns}
                emptyMessage={events.isLoading ? 'Loading activity…' : 'No smart-lock events yet.'}
                filterPlaceholder="Search activity…"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
