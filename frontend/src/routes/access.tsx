import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '../components/DataTable'
import { DevicePicker } from '../components/DevicePicker'
import { LoadingLine, PageError } from '../components/PageState'
import {
  daysLabel,
  minutesToTime,
  timeToMinutes,
  type AccessUser,
} from '../lib/api'
import { useAdminConfig } from '../lib/config'
import { useCreateUser, useRevokeUser, useUsers } from '../lib/queries'

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
          <div className="table-primary">
            <div className="avatar">{row.original.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{row.original.name}</strong>
              <span>{row.original.userId.slice(0, 8)}</span>
            </div>
          </div>
        ),
      },
      {
        id: 'days',
        header: 'Allowed days',
        accessorFn: (user) => daysLabel(user.schedule.daysMask),
      },
      {
        id: 'hours',
        header: 'Time window',
        accessorFn: (user) =>
          `${minutesToTime(user.schedule.startMinute)}–${minutesToTime(user.schedule.endMinute)}`,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            className="danger-icon-button"
            type="button"
            title="Revoke access"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(row.original.userId)}
          >
            <Trash2 size={16} />
          </button>
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
      <div className="empty-state large">
        Configure the API connection in Settings before managing access.
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Authorization policy</div>
          <h2>Access control</h2>
          <p>Issue timetable-bound credentials and revoke access from one place.</p>
        </div>
        <DevicePicker value={deviceId} onChange={setDeviceId} />
      </div>

      <div className="two-column access-layout">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">New credential</div>
              <h3>Grant access</h3>
            </div>
            <div className="panel-icon"><UserPlus size={18} /></div>
          </div>

          <label className="field">
            <span>User name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Student or staff member"
              maxLength={120}
              required
            />
          </label>

          <label className="field">
            <span>Allowed days</span>
            <select value={daysMask} onChange={(event) => setDaysMask(Number(event.target.value))}>
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
          </label>

          <div className="field-grid">
            <label className="field">
              <span>From</span>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label className="field">
              <span>Until</span>
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={!deviceId || createUser.isPending}
          >
            <KeyRound size={16} />
            {createUser.isPending ? 'Creating…' : 'Create credential'}
          </button>

          {createUser.error && <div className="inline-error">{createUser.error.message}</div>}
        </form>

        <section className="panel token-panel">
          <div className="eyebrow">Phone provisioning</div>
          <h3>Credential export</h3>
          {credential ? (
            <>
              <p>
                Import this JSON into the Android app. It contains the private credential key
                for this user.
              </p>
              <code className="secret-block">{credential}</code>
              <button
                className="secondary-button"
                type="button"
                onClick={() => navigator.clipboard.writeText(credential)}
              >
                <Copy size={16} /> Copy credential JSON
              </button>
            </>
          ) : (
            <div className="empty-state compact">
              Create a user and the phone credential will appear here.
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Current policy</div>
            <h3>Active access users</h3>
          </div>
          <span className="count-badge">{users.data?.length ?? 0}</span>
        </div>

        {!deviceId ? (
          <div className="empty-state">Select a controller to manage its users.</div>
        ) : users.isLoading ? (
          <LoadingLine label="Loading users" />
        ) : users.error ? (
          <PageError error={users.error} />
        ) : (
          <DataTable
            data={users.data ?? []}
            columns={columns}
            emptyMessage="No active users for this controller."
          />
        )}

        {revoke.error && <div className="inline-error">{revoke.error.message}</div>}
      </section>
    </div>
  )
}
