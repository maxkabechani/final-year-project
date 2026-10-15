import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, DoorOpen, Plus, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '../components/DataTable'
import { LoadingLine, PageError } from '../components/PageState'
import type { Device } from '../lib/api'
import { useAdminConfig } from '../lib/config'
import { useDevices, useRegisterDevice } from '../lib/queries'

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
          <div className="table-primary">
            <DoorOpen size={16} />
            <div>
              <strong>{row.original.name}</strong>
              <span>{row.original.deviceId}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Registered',
        cell: ({ getValue }) => new Date(String(getValue())).toLocaleString(),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: () => <span className="status-chip"><span className="status-dot" /> Registered</span>,
      },
    ],
    [],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await register.mutateAsync({ deviceId: deviceId.trim(), name: name.trim() })
    setNewToken(result.deviceToken)
  }

  if (!configured) {
    return <SetupPrompt />
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Hardware fleet</div>
          <h2>Controllers</h2>
          <p>Register ESP32 door controllers and provision their one-time API credentials.</p>
        </div>
      </div>

      <div className="two-column">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Provisioning</div>
              <h3>Register controller</h3>
            </div>
            <div className="panel-icon"><Plus size={18} /></div>
          </div>

          <label className="field">
            <span>Controller ID</span>
            <input
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9._-]+"
              required
            />
          </label>
          <label className="field">
            <span>Display name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
          </label>

          <button className="primary-button" type="submit" disabled={register.isPending}>
            <ShieldCheck size={16} />
            {register.isPending ? 'Registering…' : 'Register controller'}
          </button>

          {register.error && <div className="inline-error">{register.error.message}</div>}
        </form>

        <section className="panel token-panel">
          <div className="eyebrow">Device credential</div>
          <h3>One-time controller token</h3>
          {newToken ? (
            <>
              <p>
                Copy this into the ESP32 firmware configuration now. The API does not expose
                the raw token again.
              </p>
              <code className="secret-block">{newToken}</code>
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigator.clipboard.writeText(newToken)}
              >
                <Copy size={16} /> Copy token
              </button>
            </>
          ) : (
            <div className="empty-state compact">
              Register a controller and its one-time token will appear here.
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Inventory</div>
            <h3>Registered controllers</h3>
          </div>
          <span className="count-badge">{devices.data?.length ?? 0}</span>
        </div>

        {devices.isLoading ? (
          <LoadingLine label="Loading controllers" />
        ) : devices.error ? (
          <PageError error={devices.error} />
        ) : (
          <DataTable
            data={devices.data ?? []}
            columns={columns}
            emptyMessage="No controllers registered yet."
          />
        )}
      </section>
    </div>
  )
}

function SetupPrompt() {
  return (
    <div className="empty-state large">
      Configure the API URL and administrator token in Settings before registering controllers.
    </div>
  )
}
