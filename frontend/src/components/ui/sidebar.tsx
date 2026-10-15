import * as React from 'react'
import { cn } from '@/lib/utils'

function SidebarProvider({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-wrapper"
      className={cn('group/sidebar-wrapper flex min-h-svh w-full min-w-0 bg-sidebar', className)}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        'relative flex min-w-0 flex-1 flex-col bg-background',
        'md:m-2 md:ml-0 md:rounded-xl md:shadow-sm md:ring-1 md:ring-border/70 md:overflow-clip',
        className,
      )}
      {...props}
    />
  )
}

export { SidebarInset, SidebarProvider }
