import { LoaderCircle } from 'lucide-react'

export function FullPageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading Smart Access"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        background: 'var(--sidebar, #f8fafc)',
      }}
    >
      <LoaderCircle
        aria-hidden="true"
        className="animate-spin text-muted-foreground"
        style={{ display: 'block', width: 24, height: 24 }}
      />
    </div>
  )
}
