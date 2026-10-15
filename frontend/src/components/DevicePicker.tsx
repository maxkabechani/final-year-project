import { useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDevices } from '@/lib/queries'

type DevicePickerProps = {
  value: string
  onChange: (value: string) => void
  includeAll?: boolean
}

export function DevicePicker({
  value,
  onChange,
  includeAll = false,
}: DevicePickerProps) {
  const devices = useDevices()

  useEffect(() => {
    if (!includeAll && !value && devices.data?.[0]?.deviceId) {
      onChange(devices.data[0].deviceId)
    }
  }, [devices.data, includeAll, onChange, value])

  return (
    <label className="grid min-w-0 gap-1.5 sm:min-w-72">
      <span className="text-xs font-medium text-muted-foreground">Smart lock</span>
      <Select value={value || (includeAll ? 'all' : undefined)} onValueChange={(next) => onChange(next === 'all' ? '' : next)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select smart lock" />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">All smart locks</SelectItem>}
          {(devices.data ?? []).map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.name}{device.location ? ` · ${device.location}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
