import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function PageError({ error }: { error: unknown }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 shadow-none">
      <CardContent className="flex items-start gap-3 py-1 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <div className="font-medium">Could not load this data</div>
          <div className="mt-1 text-muted-foreground">
            {error instanceof Error
              ? error.message
              : 'Check the API connection and try again.'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function LoadingLine({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  )
}
