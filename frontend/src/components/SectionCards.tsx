import { DoorOpen, KeyRound, UsersRound, Wifi } from 'lucide-react'
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
  totalLocks,
  onlineLocks,
  people,
  grants,
}: {
  totalLocks: number
  onlineLocks: number
  people: number
  grants: number
}) {
  const cards = [
    {
      label: 'Smart locks',
      value: totalLocks,
      badge: 'Registered',
      icon: DoorOpen,
      primary: 'Managed doors and rooms',
      secondary: 'Controllers registered with the API',
      success: false,
    },
    {
      label: 'Online now',
      value: onlineLocks,
      badge: totalLocks > 0 ? `${onlineLocks}/${totalLocks}` : 'No locks',
      icon: Wifi,
      primary: 'Recently seen controllers',
      secondary: 'A lock is online when it checked in recently',
      success: onlineLocks > 0,
    },
    {
      label: 'People',
      value: people,
      badge: 'Directory',
      icon: UsersRound,
      primary: 'People available for assignment',
      secondary: 'One identity can be granted access to many locks',
      success: false,
    },
    {
      label: 'Active grants',
      value: grants,
      badge: 'Policies',
      icon: KeyRound,
      primary: 'Person-to-lock assignments',
      secondary: 'Recurring and one-off access policies',
      success: false,
    },
  ]

  return (
    <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-4">
      {cards.map(({ label, value, badge, icon: Icon, primary, secondary, success }) => (
        <Card key={label} className="@container/card bg-gradient-to-t from-muted/50 to-card shadow-xs">
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {value}
            </CardTitle>
            <CardAction>
              <Badge
                variant={success ? 'default' : 'outline'}
                className={success ? 'gap-1 bg-emerald-500 text-white hover:bg-emerald-500' : 'gap-1'}
              >
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
