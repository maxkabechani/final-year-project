import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 px-4 lg:flex-row lg:items-end lg:justify-between lg:px-6">
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="min-w-0 max-w-full shrink-0">{action}</div>}
    </div>
  )
}
