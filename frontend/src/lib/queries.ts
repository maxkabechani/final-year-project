import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  apiRequest,
  type AccessEvent,
  type AccessGrant,
  type AccessSchedule,
  type AccessUser,
  type DashboardAdmin,
  type Device,
  type Person,
} from './api'
import { useAdminConfig } from './config'

export function useDevices() {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['devices', config.apiUrl],
    enabled: configured,
    queryFn: () => apiRequest<{ devices: Device[] }>(config, '/api/devices'),
    select: (result) => result.devices,
    refetchInterval: 30_000,
  })
}

export function usePeople() {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['people', config.apiUrl],
    enabled: configured,
    queryFn: () => apiRequest<{ people: Person[] }>(config, '/api/people'),
    select: (result) => result.people,
    refetchInterval: 30_000,
  })
}

export function useAccessGrants(filters?: { deviceId?: string; personId?: string }) {
  const { config, configured } = useAdminConfig()
  const search = new URLSearchParams()
  if (filters?.deviceId) search.set('deviceId', filters.deviceId)
  if (filters?.personId) search.set('personId', filters.personId)
  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  return useQuery({
    queryKey: ['access-grants', config.apiUrl, filters?.deviceId ?? '', filters?.personId ?? ''],
    enabled: configured,
    queryFn: () =>
      apiRequest<{ grants: AccessGrant[] }>(config, `/api/access-grants${suffix}`),
    select: (result) => result.grants,
  })
}

export function useEvents(deviceId?: string) {
  const { config, configured } = useAdminConfig()
  const suffix = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
  return useQuery({
    queryKey: ['events', config.apiUrl, deviceId ?? 'all'],
    enabled: configured,
    queryFn: () => apiRequest<{ events: AccessEvent[] }>(config, `/api/events${suffix}`),
    select: (result) => result.events,
    refetchInterval: 60_000,
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

export function useEnablePairing() {
  const { config } = useAdminConfig()
  return useMutation({
    mutationFn: (deviceId: string) =>
      apiRequest<{ deviceId: string; expiresInSeconds: number }>(
        config, `/api/devices/${encodeURIComponent(deviceId)}/pairing`, { method: 'POST' },
      ),
    onSuccess: () => toast.success('Pairing enabled for 2 minutes. Use the lock’s pairing PIN in the Android app.'),
    onError: (error) => toast.error(error.message),
  })
}

export function useRegisterDevice() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { deviceId: string; name: string; location: string }) =>
      apiRequest<{ deviceId: string; deviceToken: string }>(config, '/api/devices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast.success('Smart lock registered')
    },
  })
}

export function useCreatePerson() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiRequest<{ personId: string; name: string; credentialKeyHex: string }>(
        config,
        '/api/people',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['people'] })
      toast.success('Person created')
    },
  })
}

export function useGrantAccess() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      personId: string
      deviceId: string
      schedule: AccessSchedule
    }) =>
      apiRequest<{
        grantId: string
        personId: string
        name: string
        deviceId: string
        schedule: AccessSchedule
      }>(config, '/api/access-grants', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['access-grants'] }),
        queryClient.invalidateQueries({ queryKey: ['people'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
      ])
      toast.success('Access updated')
    },
  })
}

export function useRevokeGrant() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (grantId: string) =>
      apiRequest<void>(config, `/api/access-grants/${encodeURIComponent(grantId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['access-grants'] }),
        queryClient.invalidateQueries({ queryKey: ['people'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
      ])
      toast.success('Access revoked')
    },
  })
}

// Backward-compatible helpers used by the Android-oriented flows.
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


export function useAdmins() {
  const { config, configured } = useAdminConfig()
  return useQuery({
    queryKey: ['admins', config.apiUrl],
    enabled: configured,
    queryFn: () => apiRequest<{ admins: DashboardAdmin[] }>(config, '/api/admins'),
    select: (result) => result.admins,
  })
}

export function useCreateAdmin() {
  const { config } = useAdminConfig()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      apiRequest<{ admin: DashboardAdmin }>(config, '/api/admins', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Administrator added')
    },
  })
}
