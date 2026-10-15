import {
  Activity,
  DoorOpen,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SectionCards({
  controllers,
  activeUsers,
  granted,
  denied,
}: {
  controllers: number
  activeUsers: number | null
  granted: number | null
  denied: number | null
}) {
  const totalDecisions = (granted ?? 0) + (denied ?? 0)
  const successRate =
    totalDecisions > 0 ? Math.round(((granted ?? 0) / totalDecisions) * 100) : null

  const cards = [
    {
      label: 'Controllers',
      value: controllers,
      badge: 'Registered',
      icon: DoorOpen,
      primary: 'Door controllers registered',
      secondary: 'Managed by the Fastify API',
    },
    {
      label: 'Active users',
      value: activeUsers ?? '—',
      badge: activeUsers === null ? 'Select door' : 'Synced',
      icon: UserCheck,
      primary: 'Current access credentials',
      secondary: 'For the selected controller',
    },
    {
      label: 'Granted access',
      value: granted ?? '—',
      badge: successRate === null ? 'No data' : `${successRate}% success`,
      icon: ShieldCheck,
      primary: 'Successful unlock decisions',
      secondary: 'Within the latest audit events',
    },
    {
      label: 'Denied attempts',
      value: denied ?? '—',
      badge: denied === null ? 'No data' : 'Audited',
      icon: Activity,
      primary: 'Rejected access attempts',
      secondary: 'Visible in the activity log',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-4">
      {cards.map(({ label, value, badge, icon: Icon, primary, secondary }) => (
        <Card
          key={label}
          className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs"
        >
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {value}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="gap-1">
                <Icon className="size-3" />
                {badge}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="font-medium">{primary}</div>
            <div className="text-muted-foreground">{secondary}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
