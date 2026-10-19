import assert from 'node:assert/strict'
import test from 'node:test'
import { accessDate, accessDateTime, accessDayMask } from '../src/lib/access-time.ts'

test('one-off timestamps and edit dates use Zambia time in every browser timezone', () => {
  const originalTz = process.env.TZ
  try {
    for (const timezone of ['UTC', 'Africa/Lusaka', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone
      const start = accessDateTime('2026-10-19', '08:30')
      assert.equal(start.toISOString(), '2026-10-19T06:30:00.000Z')
      assert.equal(accessDate(start), '2026-10-19')
      assert.equal(accessDayMask(start), 1)
      assert.equal(accessDateTime('2026-10-19', '24:00').toISOString(), '2026-10-19T22:00:00.000Z')
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  }
})

test('default date and weekday roll over together at Zambia midnight', () => {
  const before = new Date('2026-10-18T21:59:59Z')
  const after = new Date('2026-10-18T22:00:00Z')
  assert.equal(accessDate(before), '2026-10-18')
  assert.equal(accessDayMask(before), 64)
  assert.equal(accessDate(after), '2026-10-19')
  assert.equal(accessDayMask(after), 1)
})

test('rejects invalid dates and times rather than silently shifting access', () => {
  for (const [date, time] of [['2026-02-30', '08:00'], ['2026-10-19', '24:01'], ['2026-10-19', '12:60'], ['', '08:00']]) {
    assert.equal(Number.isNaN(accessDateTime(date, time).getTime()), true)
  }
})
