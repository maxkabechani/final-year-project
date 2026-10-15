export type Device = {
  deviceId: string
  name: string
  location: string
  createdAt: string
  lastSeenAt: string | null
  online: boolean
}

export type Person = {
  personId: string
  name: string
  createdAt: string
  activeLocks: number
}

export type AccessType = 'recurring' | 'one_off'

export type AccessSchedule = {
  accessType: AccessType
  daysMask: number
  startMinute: number
  endMinute: number
  validFrom: number
  validUntil: number | null
}

export type AccessGrant = {
  grantId: string
  personId: string
  personName: string
  deviceId: string
  deviceName: string
  location: string
  accessType: AccessType
  daysMask: number
  startMinute: number
  endMinute: number
  validFrom: number
  validUntil: number | null
  createdAt: string
}

export type AccessUser = {
  userId: string
  name: string
  schedule: AccessSchedule
}

export type AccessEvent = {
  eventId: string
  deviceId?: string
  deviceName?: string
  location?: string
  occurredAt: string
  type: string
  userId: string | null
  userName?: string | null
  detail: string
}

export type AdminConfig = {
  apiUrl: string
  adminToken: string
}

type JsonObject = Record<string, unknown>

export async function apiRequest<T>(
  config: AdminConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = config.apiUrl.replace(/\/+$/, '')
  const response = await fetch(base + path, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${config.adminToken}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body = (await response.json()) as JsonObject
  if (!response.ok) {
    throw new Error(String(body.error ?? 'Request failed'))
  }

  return body as T
}

export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export const timeToMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export const daysLabel = (mask: number): string => {
  if (mask === 127) return 'Every day'
  if (mask === 31) return 'Mon–Fri'
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return labels.filter((_, index) => Boolean(mask & (1 << index))).join(', ')
}

export const dayMaskFromDate = (value: Date): number => {
  const jsDay = value.getDay()
  const mondayFirst = jsDay === 0 ? 6 : jsDay - 1
  return 1 << mondayFirst
}

export const grantState = (grant: AccessGrant): 'active' | 'expired' => {
  if (grant.validUntil !== null && grant.validUntil <= Math.floor(Date.now() / 1000)) {
    return 'expired'
  }
  return 'active'
}
