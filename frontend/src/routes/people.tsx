import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Smartphone, UsersRound } from 'lucide-react'
import { useMemo } from 'react'
import { DataTable } from '@/components/DataTable'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Person } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { usePeople } from '@/lib/queries'

export const Route = createFileRoute('/people')({
  head: () => ({
    title: 'People | Smart Access',
    meta: [
      { name: 'description', content: 'View registered Smart Access users and their assigned smart locks.' },
      { property: 'og:title', content: 'People | Smart Access' },
      { property: 'og:description', content: 'View registered Smart Access users and their assigned smart locks.' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PeoplePage,
})

function PeoplePage() {
  const { configured } = useAdminConfig()
  const people = usePeople()

  const columns = useMemo<ColumnDef<Person>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Person',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-muted text-xs font-semibold">
            {row.original.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{row.original.name}</div>
            <code className="text-xs text-muted-foreground">{row.original.personId.slice(0, 8)}</code>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'studentNumber',
      header: 'Student number',
      cell: ({ getValue }) => (
        <span className="font-medium">{String(getValue() || 'Not registered from app')}</span>
      ),
    },
    {
      accessorKey: 'activeLocks',
      header: 'Assigned locks',
      cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Registered',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{new Date(String(getValue())).toLocaleString()}</span>
      ),
    },
  ], [])

  if (!configured) {
    return (
      <div className="p-4 lg:p-6">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection first.</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader
        eyebrow="Identity directory"
        title="People"
        description="Users register the app with their full name and student/computer number, then appear here ready for access assignment."
      />

      <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Registered people</CardTitle>
            <CardDescription>{people.data?.length ?? 0} person(s) known to Smart Access.</CardDescription>
          </CardHeader>
          <CardContent>
            {people.error ? (
              <PageError error={people.error} />
            ) : (
              <DataTable
                data={people.data ?? []}
                columns={columns}
                emptyMessage={people.isLoading ? 'Loading people…' : 'No one has registered from the app yet.'}
                filterPlaceholder="Search name or student number…"
              />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <div className="mb-2 grid size-9 place-items-center rounded-lg bg-muted">
              <Smartphone className="size-4" />
            </div>
            <CardTitle>Simple registration</CardTitle>
            <CardDescription>
              A user installs Smart Access, enters their full name and student/computer number once, then appears here automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-2"><Badge variant="outline">1</Badge><span>User registers their device.</span></div>
            <div className="flex gap-2"><Badge variant="outline">2</Badge><span>Administrator assigns one or more doors.</span></div>
            <div className="flex gap-2"><Badge variant="outline">3</Badge><span>Nearby authorized locks become unlockable in the app.</span></div>
            <div className="flex items-center gap-2 border-t pt-3 text-xs">
              <UsersRound className="size-4" />
              <span>No access is granted by registration alone.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
