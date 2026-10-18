# Smart Access ESP32 firmware

There is now one controller firmware source in the repository:

`firmware/SmartAccessLock/SmartAccessLock.ino`

Use this same sketch from Arduino IDE, ArduinoDroid, or the GitHub Actions firmware build.

## Arduino setup

Install:

- ESP32 board support by Espressif (CI uses 2.0.17)
- ArduinoJson 7.4.2
- WebSockets 2.7.3 by Markus Sattler

Select **ESP32 Dev Module** and **Huge APP (3MB No OTA / 1MB SPIFFS)**, then compile and upload.

The editable controller settings are at the top of the sketch:

- controller ID
- pairing PIN
- Wi-Fi SSID/password
- backend URL
- controller token

No backend CA certificate is required by this project firmware.

## Backend synchronization

BLE unlocking remains offline-first. Cached users, schedules and the last synchronized software clock remain usable when Wi-Fi or the backend is unavailable.

When Wi-Fi is available, the controller opens one secure WebSocket connection to:

`wss://<backend>/ws/device/<controller-id>`

The controller authenticates once after the WebSocket connects. The backend immediately sends the current server time and access grants. When an administrator changes a grant, the backend pushes a fresh sync over the existing WebSocket instead of waiting for a polling interval.

The controller sends a small heartbeat every 30 seconds over the same WebSocket. The heartbeat keeps dashboard presence current without repeatedly creating HTTPS requests or TLS handshakes. If Wi-Fi or the socket drops, it reconnects automatically and receives a full sync again.

Audit events remain queued locally and are uploaded over HTTPS only when there are events waiting.

## Hardware behavior

- BLE name: `LOCK-<device-id>`
- Relay: GPIO 33, active-high on the final relay module
- Buzzer: GPIO 14
- Common-cathode RGB LED: GPIO 27 / 26 / 25
- Pairing window: 120 seconds after boot
- Unlock pulse: five seconds
- Up to 48 access credentials cached in NVS
- Up to 24 audit events queued in NVS
