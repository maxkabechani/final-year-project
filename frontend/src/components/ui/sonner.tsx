import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border-border bg-background text-foreground shadow-lg',
        },
      }}
      {...props}
    />
  )
}
