import { useEffect } from 'react'
import { useDevices } from '@/lib/queries'

type DevicePickerProps = {
  value: string
  onChange: (value: string) => void
}

export function DevicePicker({ value, onChange }: DevicePickerProps) {
  const devices = useDevices()

  useEffect(() => {
    if (!value && devices.data?.[0]?.deviceId) {
      onChange(devices.data[0].deviceId)
    }
  }, [devices.data, onChange, value])

  return (
    <label className="grid min-w-0 gap-1.5 sm:min-w-72">
      <span className="text-xs font-medium text-muted-foreground">Controller</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
        aria-label="Select controller"
      >
        <option value="">Select controller</option>
        {(devices.data ?? []).map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.name} · {device.deviceId}
          </option>
        ))}
      </select>
    </label>
  )
}
