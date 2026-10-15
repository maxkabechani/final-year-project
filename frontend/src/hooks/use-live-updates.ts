import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAdminConfig } from '@/lib/config'

export function useLiveUpdates() {
  const { config, configured } = useAdminConfig()
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!configured) {
      setConnected(false)
      return
    }

    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    let socket: WebSocket | undefined

    const connect = () => {
      const wsUrl = config.apiUrl
        .replace(/\/+$/, '')
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')

      socket = new WebSocket(`${wsUrl}/ws/admin`)

      socket.addEventListener('open', () => {
        socket?.send(JSON.stringify({ type: 'auth', token: config.adminToken }))
      })

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string
            deviceId?: string
          }
          if (message.type === 'ready') {
            setConnected(true)
            return
          }
          if (message.type === 'auth_error') {
            setConnected(false)
            return
          }
          if (message.type === 'device_seen' || message.type === 'devices_changed') {
            void queryClient.invalidateQueries({ queryKey: ['devices'] })
          }
          if (message.type === 'people_changed') {
            void queryClient.invalidateQueries({ queryKey: ['people'] })
          }
          if (message.type === 'access_changed') {
            void queryClient.invalidateQueries({ queryKey: ['access-grants'] })
            void queryClient.invalidateQueries({ queryKey: ['people'] })
            void queryClient.invalidateQueries({ queryKey: ['users'] })
          }
          if (message.type === 'events_changed') {
            void queryClient.invalidateQueries({ queryKey: ['events'] })
          }
        } catch {
          // Ignore malformed frames; the next valid server event will recover state.
        }
      })

      socket.addEventListener('close', () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 3000)
      })

      socket.addEventListener('error', () => {
        setConnected(false)
        socket?.close()
      })
    }

    connect()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [config.adminToken, config.apiUrl, configured, queryClient])

  return connected
}
