import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ConfirmAction({ name, description, onConfirm, disabled = false, label = 'Delete' }: {
  name: string
  description: string
  onConfirm: () => Promise<unknown>
  disabled?: boolean
  label?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <>
    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={disabled || pending}
      aria-label={`${label} ${name}`} onClick={() => { setError(''); dialog.current?.showModal() }}>
      <Trash2 /> {label}
    </Button>
    <dialog ref={dialog} aria-label={`${label} ${name}?`} onCancel={(event) => { if (pending) event.preventDefault() }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50">
      <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault()
        if (pending) return
        setPending(true)
        try { await onConfirm(); dialog.current?.close() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'The action failed. Try again.') }
        finally { setPending(false) }
      }}>
        <h2 className="text-lg font-semibold">{label} {name}?</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={pending}>{pending ? 'Please wait…' : label}</Button>
        </div>
      </form>
    </dialog>
  </>
}
