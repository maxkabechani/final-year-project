// The controller's timetable is always Africa/Lusaka (UTC+02:00).
// Date ranges remain UTC instants; only calendar dates/days/times use this offset.
export const accessUtcOffsetMinutes = 120

export const accessDate = (instant: Date): string =>
  new Date(instant.getTime() + accessUtcOffsetMinutes * 60_000).toISOString().slice(0, 10)

export const accessDayMask = (instant: Date): number => {
  const day = new Date(instant.getTime() + accessUtcOffsetMinutes * 60_000).getUTCDay()
  return 1 << (day === 0 ? 6 : day - 1)
}

export const accessDateTime = (date: string, time: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(time)) {
    return new Date(Number.NaN)
  }
  const midnight = new Date(`${date}T00:00:00+02:00`)
  if (!Number.isFinite(midnight.getTime()) || accessDate(midnight) !== date) {
    return new Date(Number.NaN)
  }
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(midnight.getTime() + (hours * 60 + minutes) * 60_000)
}
