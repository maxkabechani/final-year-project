import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { AdminConfig } from './api'

type ConfigContextValue = {
  config: AdminConfig
  configured: boolean
  updateConfig: (next: AdminConfig) => void
  clearConfig: () => void
}

const defaultApiUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<AdminConfig>({
    apiUrl: defaultApiUrl,
    adminToken: '',
  })

  useEffect(() => {
    const stored = window.localStorage.getItem('cl3-admin-config')
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as Partial<AdminConfig>
      setConfig({
        apiUrl: parsed.apiUrl?.replace(/\/+$/, '') || defaultApiUrl,
        adminToken: parsed.adminToken ?? '',
      })
    } catch {
      window.localStorage.removeItem('cl3-admin-config')
    }
  }, [])

  const updateConfig = (next: AdminConfig) => {
    const normalized = {
      apiUrl: next.apiUrl.trim().replace(/\/+$/, ''),
      adminToken: next.adminToken.trim(),
    }
    setConfig(normalized)
    window.localStorage.setItem('cl3-admin-config', JSON.stringify(normalized))
  }

  const clearConfig = () => {
    const next = { apiUrl: defaultApiUrl, adminToken: '' }
    setConfig(next)
    window.localStorage.removeItem('cl3-admin-config')
  }

  const value = useMemo(
    () => ({
      config,
      configured: Boolean(config.apiUrl && config.adminToken),
      updateConfig,
      clearConfig,
    }),
    [config],
  )

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useAdminConfig(): ConfigContextValue {
  const context = useContext(ConfigContext)
  if (!context) throw new Error('useAdminConfig must be used inside ConfigProvider')
  return context
}
