import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Smartphone, UsersRound } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '@/components/DataTable'
import { PageError } from '@/components/PageState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Person } from '@/lib/api'
import { useAdminConfig } from '@/lib/config'
import { usePeople, useUpdatePerson } from '@/lib/queries'

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
  const update = useUpdatePerson()
  const [editing, setEditing] = useState<Person | null>(null)
  const [name, setName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')

  const editPerson = (person: Person) => {
    update.reset()
    setEditing(person)
    setName(person.name)
    setStudentNumber(person.studentNumber ?? '')
  }

  const savePerson = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    try {
      await update.mutateAsync({ personId: editing.personId, name: name.trim(), studentNumber: studentNumber.trim() })
      setEditing(null)
    } catch {
      // Keep the form and the server error visible so the administrator can correct it.
    }
  }

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
        <span className="font-medium">{String(getValue() || 'Student number missing')}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={update.isPending}
          aria-label={`Edit ${row.original.name}`}
          onClick={() => editPerson(row.original)}
        >
          <Pencil /> Edit person
        </Button>
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
  ], [update.isPending, update.reset])

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

        {editing ? (
          <Card className="h-fit" role="region" aria-label="Edit person">
            <CardHeader>
              <CardTitle>Edit person</CardTitle>
              <CardDescription>Update this existing identity. Its phone credentials and door access stay attached.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePerson} className="space-y-4">
                <p className="break-all text-xs text-muted-foreground">Person ID: {editing.personId}</p>
                <div className="grid gap-2">
                  <label htmlFor="edit-person-name" className="text-sm font-medium">Full name</label>
                  <Input id="edit-person-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required disabled={update.isPending} autoFocus />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="edit-student-number" className="text-sm font-medium">Student/computer number</label>
                  <Input id="edit-student-number" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} minLength={4} maxLength={32} pattern="[A-Za-z0-9._-]{4,32}" disabled={update.isPending} aria-describedby="edit-student-number-help" />
                  <p id="edit-student-number-help" className="text-xs text-muted-foreground">Leave blank if unknown. Each student number must be unique.</p>
                </div>
                {update.error && <PageError error={update.error} />}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</Button>
                  <Button type="button" variant="outline" disabled={update.isPending} onClick={() => { setEditing(null); update.reset() }}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : <Card className="h-fit">
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
            <p>For users enrolled with the earlier phone-number version, use <strong>Edit person</strong> to add their student number to the existing identity.</p>
            <div className="flex gap-2"><Badge variant="outline">1</Badge><span>User registers their device.</span></div>
            <div className="flex gap-2"><Badge variant="outline">2</Badge><span>Administrator assigns one or more doors.</span></div>
            <div className="flex gap-2"><Badge variant="outline">3</Badge><span>Nearby authorized locks become unlockable in the app.</span></div>
            <div className="flex items-center gap-2 border-t pt-3 text-xs">
              <UsersRound className="size-4" />
              <span>No access is granted by registration alone.</span>
            </div>
          </CardContent>
        </Card>}
      </div>
    </div>
  )
}
