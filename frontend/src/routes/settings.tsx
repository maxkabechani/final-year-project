import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAdminConfig } from '../lib/config'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { config, configured, updateConfig, clearConfig } = useAdminConfig()
  const [apiUrl, setApiUrl] = useState(config.apiUrl)
  const [adminToken, setAdminToken] = useState(config.adminToken)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setApiUrl(config.apiUrl)
    setAdminToken(config.adminToken)
  }, [config])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    updateConfig({ apiUrl, adminToken })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="narrow-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Dashboard configuration</div>
          <h2>API connection</h2>
          <p>Connect the TanStack frontend to the separately deployed Fastify API.</p>
        </div>
      </div>

      <form className="panel form-panel" onSubmit={submit}>
        <label className="field">
          <span>Fastify API URL</span>
          <input
            type="url"
            required
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="https://api.cl3.example.com"
          />
          <small>No trailing /api path is required.</small>
        </label>

        <label className="field">
          <span>Administrator token</span>
          <input
            type="password"
            required
            minLength={24}
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="At least 24 characters"
            autoComplete="off"
          />
          <small>Stored in this browser's local storage for the prototype.</small>
        </label>

        <div className="form-actions">
          <button className="primary-button" type="submit">
            <CheckCircle2 size={16} /> {saved ? 'Saved' : 'Save connection'}
          </button>
          {configured && (
            <button className="secondary-button" type="button" onClick={clearConfig}>
              <RotateCcw size={16} /> Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
