import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { DevicePicker } from '../components/DevicePicker'
import { LoadingLine, PageError } from '../components/PageState'
import type { AccessEvent } from '../lib/api'
import { useAdminConfig } from '../lib/config'
import { useEvents } from '../lib/queries'

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
        cell: ({ getValue }) => new Date(String(getValue())).toLocaleString(),
      },
      {
        accessorKey: 'type',
        header: 'Event',
        cell: ({ getValue }) => {
          const type = String(getValue())
          return <span className={`event-chip ${type}`}>{type.replaceAll('_', ' ')}</span>
        },
      },
      {
        accessorKey: 'userId',
        header: 'User',
        cell: ({ getValue }) => {
          const value = getValue()
          return value ? String(value).slice(0, 8) : '—'
        },
      },
      {
        accessorKey: 'detail',
        header: 'Detail',
        cell: ({ getValue }) => String(getValue() || '—'),
      },
    ],
    [],
  )

  if (!configured) {
    return (
      <div className="empty-state large">
        Configure the API connection in Settings before viewing audit events.
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Audit trail</div>
          <h2>Door activity</h2>
          <p>Granted, denied, enrollment and physical door events uploaded by the controller.</p>
        </div>
        <div className="heading-actions">
          <DevicePicker value={deviceId} onChange={setDeviceId} />
          <button
            className="secondary-button icon-only-mobile"
            type="button"
            disabled={!deviceId || events.isFetching}
            onClick={() => events.refetch()}
          >
            <RefreshCw className={events.isFetching ? 'spin' : ''} size={16} />
            Refresh
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Latest 200</div>
            <h3>Controller events</h3>
          </div>
          <div className="panel-icon"><Activity size={18} /></div>
        </div>

        {!deviceId ? (
          <div className="empty-state">Select a controller to view its audit trail.</div>
        ) : events.isLoading ? (
          <LoadingLine label="Loading events" />
        ) : events.error ? (
          <PageError error={events.error} />
        ) : (
          <DataTable
            data={events.data ?? []}
            columns={columns}
            emptyMessage="No events have been uploaded by this controller yet."
          />
        )}
      </section>
    </div>
  )
}
