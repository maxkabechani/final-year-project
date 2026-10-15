export type Device = {
  deviceId: string
  name: string
  createdAt: string
}

export type AccessSchedule = {
  daysMask: number
  startMinute: number
  endMinute: number
  validFrom: number
  validUntil: number | null
}

export type AccessUser = {
  userId: string
  name: string
  schedule: AccessSchedule
}

export type AccessEvent = {
  eventId: string
  occurredAt: string
  type: string
  userId: string | null
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
