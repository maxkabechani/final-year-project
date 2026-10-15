import { AlertTriangle, LoaderCircle } from 'lucide-react'

export function PageError({ error }: { error: unknown }) {
  return (
    <div className="state-panel error-panel">
      <AlertTriangle size={20} />
      <div>
        <strong>Could not load data</strong>
        <span>{error instanceof Error ? error.message : 'Unknown error'}</span>
      </div>
    </div>
  )
}

export function LoadingLine({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading-line">
      <LoaderCircle className="spin" size={16} /> {label}
    </div>
  )
}
