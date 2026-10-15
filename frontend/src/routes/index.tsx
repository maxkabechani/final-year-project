import { createFileRoute, Link } from '@tanstack/react-router'
import { Activity, ArrowRight, DoorOpen, ShieldCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { DevicePicker } from '../components/DevicePicker'
import { LoadingLine, PageError } from '../components/PageState'
import { useAdminConfig } from '../lib/config'
import { useDevices, useEvents, useUsers } from '../lib/queries'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  const { configured } = useAdminConfig()
  const [deviceId, setDeviceId] = useState('')
  const devices = useDevices()
  const users = useUsers(deviceId)
  const events = useEvents(deviceId)

  if (!configured) {
    return (
      <section className="hero-card">
        <div className="hero-icon"><ShieldCheck size={28} /></div>
        <div>
          <div className="eyebrow">First-time setup</div>
          <h2>Connect this dashboard to the CL3 API</h2>
          <p>
            Add the deployed Fastify API URL and administrator token. The token stays in
            this browser and is sent only as the API bearer credential.
          </p>
          <Link to="/settings" className="primary-button">
            Configure dashboard <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    )
  }

  if (devices.error) return <PageError error={devices.error} />

  const recent = events.data?.slice(0, 5) ?? []
  const granted = (events.data ?? []).filter((event) => event.type === 'granted').length

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">System overview</div>
          <h2>Access at a glance</h2>
          <p>Controller state, active credentials and the latest door activity.</p>
        </div>
        <DevicePicker value={deviceId} onChange={setDeviceId} />
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-icon"><DoorOpen size={19} /></div>
          <span>Controllers</span>
          <strong>{devices.data?.length ?? 0}</strong>
          <small>Registered with the API</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><UserCheck size={19} /></div>
          <span>Active users</span>
          <strong>{deviceId ? users.data?.length ?? 0 : '—'}</strong>
          <small>Credentials on selected door</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><Activity size={19} /></div>
          <span>Recent grants</span>
          <strong>{deviceId ? granted : '—'}</strong>
          <small>Within the latest event window</small>
        </article>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Live audit trail</div>
            <h3>Recent activity</h3>
          </div>
          <Link to="/events" className="text-link">View all <ArrowRight size={14} /></Link>
        </div>

        {!deviceId ? (
          <div className="empty-state">Choose a controller to view its activity.</div>
        ) : events.isLoading ? (
          <LoadingLine label="Loading activity" />
        ) : events.error ? (
          <PageError error={events.error} />
        ) : recent.length === 0 ? (
          <div className="empty-state">No uploaded events yet.</div>
        ) : (
          <div className="activity-list">
            {recent.map((event) => (
              <div className="activity-row" key={event.eventId}>
                <span className={`event-dot ${event.type}`} />
                <div>
                  <strong>{event.type.replaceAll('_', ' ')}</strong>
                  <span>{event.detail || 'Controller event'}</span>
                </div>
                <time>{new Date(event.occurredAt).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
