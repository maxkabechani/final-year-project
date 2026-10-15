import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { DataTable } from '@/components/DataTable'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Person } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { usePeople } from '@/lib/queries'

export const Route = createFileRoute('/people')({ component: PeoplePage })

function PeoplePage() {
  const { configured } = useAdminConfig()
  const people = usePeople()

  const columns = useMemo<ColumnDef<Person>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Person',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">{row.original.name.slice(0, 1).toUpperCase()}</div>
          <div><div className="font-medium">{row.original.name}</div><code className="text-xs text-muted-foreground">{row.original.personId.slice(0, 8)}</code></div>
        </div>
      ),
    },
    {
      accessorKey: 'activeLocks',
      header: 'Assigned locks',
      cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => <span className="text-muted-foreground">{new Date(String(getValue())).toLocaleDateString()}</span>,
    },
  ], [])

  if (!configured) return <div className="p-4 lg:p-6"><Card><CardContent className="py-8 text-sm text-muted-foreground">Configure the API connection first.</CardContent></Card></div>

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <PageHeader eyebrow="Identity directory" title="People" description="People can be assigned to one or many smart locks with independent schedules." />
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>People directory</CardTitle><CardDescription>Create new people while granting access; they then remain available for other locks.</CardDescription></CardHeader>
          <CardContent>
            {people.error ? <PageError error={people.error} /> : (
              <DataTable data={people.data ?? []} columns={columns} emptyMessage={people.isLoading ? 'Loading people…' : 'No people have been created yet.'} filterPlaceholder="Search people…" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
