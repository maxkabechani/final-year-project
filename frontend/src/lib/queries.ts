import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest, type AccessEvent, type AccessSchedule, type AccessUser, type Device } from './api'
import { useAdminConfig } from './config'

export function useDevices() {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['devices', config.apiUrl],
    enabled: configured,
    queryFn: () => apiRequest<{ devices: Device[] }>(config, '/api/devices'),
    select: (result) => result.devices,
  })
}

export function useUsers(deviceId: string) {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['users', config.apiUrl, deviceId],
    enabled: configured && Boolean(deviceId),
    queryFn: () =>
      apiRequest<{ users: AccessUser[] }>(
        config,
        `/api/devices/${encodeURIComponent(deviceId)}/users`,
      ),
    select: (result) => result.users,
  })
}

export function useEvents(deviceId: string) {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['events', config.apiUrl, deviceId],
    enabled: configured && Boolean(deviceId),
    refetchInterval: 15_000,
    queryFn: () =>
      apiRequest<{ events: AccessEvent[] }>(
        config,
        `/api/devices/${encodeURIComponent(deviceId)}/events`,
      ),
    select: (result) => result.events,
  })
}

export function useRegisterDevice() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { deviceId: string; name: string }) =>
      apiRequest<{ deviceId: string; deviceToken: string }>(config, '/api/devices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  })
}

export function useCreateUser(deviceId: string) {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; schedule: AccessSchedule }) =>
      apiRequest<{
        userId: string
        credentialKeyHex: string
        schedule: AccessSchedule
      }>(config, `/api/devices/${encodeURIComponent(deviceId)}/users`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useRevokeUser(deviceId: string) {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest<void>(
        config,
        `/api/devices/${encodeURIComponent(deviceId)}/users/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}
