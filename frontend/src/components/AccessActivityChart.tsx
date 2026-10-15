import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessEvent } from '@/lib/api'

const ranges = [7, 14, 30] as const

export function AccessActivityChart({ events }: { events: AccessEvent[] }) {
  const [days, setDays] = useState<(typeof ranges)[number]>(14)

  const data = useMemo(() => {
    const byDay = new Map<string, { granted: number; denied: number }>()
    for (const event of events) {
      if (event.type !== 'granted' && event.type !== 'denied') continue
      const key = new Date(event.occurredAt).toISOString().slice(0, 10)
      const current = byDay.get(key) ?? { granted: 0, denied: 0 }
      current[event.type] += 1
      byDay.set(key, current)
    }
    const today = new Date()
    const rows: Array<{ label: string; granted: number; denied: number }> = []
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - offset)
      const key = date.toISOString().slice(0, 10)
      rows.push({ label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ...(byDay.get(key) ?? { granted: 0, denied: 0 }) })
    }
    return rows
  }, [days, events])

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Access activity</CardTitle>
        <CardDescription>Granted and denied BLE unlock decisions from the selected lock scope.</CardDescription>
        <CardAction>
          <div className="hidden gap-1 rounded-lg border bg-muted/40 p-1 sm:flex">
            {ranges.map((range) => <Button key={range} type="button" variant={days === range ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs" onClick={() => setDays(range)}>{range}d</Button>)}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <Tooltip cursor={{ stroke: 'var(--border)' }} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--card-foreground)', fontSize: 12 }} />
              <Area type="monotone" dataKey="granted" name="Granted" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="denied" name="Denied" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.07} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
