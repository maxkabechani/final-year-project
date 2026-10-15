# Smart Access ESP32 firmware

The final presentation controller uses only:

- ESP32-32S
- active-low relay on GPIO 33
- active buzzer on GPIO 14
- common-cathode RGB LED on GPIO 27 / 26 / 25
- BLE phone access

There is no LCD, physical RTC, reed sensor or exit-button dependency in the current firmware.

## Easiest upload from Android

Use the single-file ArduinoDroid sketch:

`../firmware-android/SmartAccessLock/SmartAccessLock.ino`

It puts all editable settings at the top of one file.

Install:

- `NimBLE-Arduino`
- `ArduinoJson`

Select **ESP32 Dev Module**, connect using USB OTG, compile and upload.

## PlatformIO build

The canonical PlatformIO source remains in this folder.

```bash
pio run -d firmware
pio run -d firmware -t upload
pio device monitor -b 115200
```

For PlatformIO, copy `include/config.example.h` to `include/smart_lock_local_config.h` and set the controller configuration there.

## Behaviour

- BLE name: `LOCK-<device-id>`
- 120-second pairing window automatically opens after boot.
- Valid unlock pulses the relay for five seconds.
- Green indicates success, red denial and blue ready/pairing state.
- Up to 48 access credentials are cached in NVS.
- Up to 24 audit events are queued in NVS.
- Recurring and one-off access windows are checked locally.
- Backend synchronization is optional for the initial BLE demo.
- When Wi-Fi is configured, the controller synchronizes time, access grants and audit events with the Fastify API.
