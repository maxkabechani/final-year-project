import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  keywords?: string
}

type SearchComboboxProps = {
  value: string
  onValueChange(value: string): void
  options: ComboboxOption[]
  placeholder: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function SearchCombobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No results found.',
  disabled = false,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between px-3 py-2 text-left font-normal"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{option.label}</div>
                    {option.description && (
                      <div className="truncate text-xs text-muted-foreground">{option.description}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
