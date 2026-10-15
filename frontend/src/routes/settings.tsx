import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { useAdminConfig } from '@/lib/config'

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
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Dashboard configuration"
        title="API connection"
        description="Connect the TanStack application to the separately deployed Fastify API."
      />

      <div className="max-w-3xl px-4 lg:px-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Administrator connection</CardTitle>
                <CardDescription className="mt-2">
                  The token is stored in this browser for the supervised prototype and sent only
                  to the configured API as a bearer credential.
                </CardDescription>
              </div>
              <Badge variant={configured ? 'secondary' : 'outline'}>
                {configured ? 'Configured' : 'Setup required'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-2">
                <label htmlFor="api-url" className="text-sm font-medium">Fastify API URL</label>
                <Input
                  id="api-url"
                  type="url"
                  required
                  value={apiUrl}
                  onChange={(event) => setApiUrl(event.target.value)}
                  placeholder="https://api.cl3.example.com"
                  autoComplete="url"
                />
                <p className="text-xs text-muted-foreground">Use the API origin only; do not append /api.</p>
              </div>

              <div className="grid gap-2">
                <label htmlFor="admin-token" className="text-sm font-medium">Administrator token</label>
                <Input
                  id="admin-token"
                  type="password"
                  required
                  minLength={24}
                  value={adminToken}
                  onChange={(event) => setAdminToken(event.target.value)}
                  placeholder="At least 24 characters"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  If authentication fails, verify that this matches ADMIN_TOKEN on the Fastify deployment.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  <CheckCircle2 />
                  {saved ? 'Connection saved' : 'Save connection'}
                </Button>
                {configured && (
                  <Button type="button" variant="outline" onClick={clearConfig}>
                    <RotateCcw />
                    Clear saved connection
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
