import { useEffect } from 'react'
import { useDevices } from '../lib/queries'

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
    <label className="field compact-field">
      <span>Controller</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
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
