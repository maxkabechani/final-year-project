import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react'
import type { AdminConfig } from './api'

export const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://api-project.maxkabechani.dev'

type ConfigContextValue = {
  config: AdminConfig
  configured: boolean
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: PropsWithChildren) {
  const value = useMemo(
    () => ({
      config: { apiUrl: apiBaseUrl },
      configured: Boolean(apiBaseUrl),
    }),
    [],
  )

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useAdminConfig(): ConfigContextValue {
  const context = useContext(ConfigContext)
  if (!context) throw new Error('useAdminConfig must be used inside ConfigProvider')
  return context
}
