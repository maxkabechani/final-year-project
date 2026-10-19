# Smart Access ESP32 firmware

There is now one controller firmware source in the repository:

`firmware/SmartAccessLock/SmartAccessLock.ino`

Use this same sketch from Arduino IDE, ArduinoDroid, or the GitHub Actions firmware build.

## Arduino setup

Install:

- ESP32 board support by Espressif (CI uses 2.0.17)
- ArduinoJson 7.4.2
- WebSockets by Markus Sattler 2.7.3 (the version pinned in CI)

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

Audit events use the same WebSocket, avoiding a second simultaneous TLS client on the ESP32. An `events` message carries a unique request ID and persistent event IDs. The backend commits the batch before returning `events_ack`. Only those acknowledged events are removed from NVS; new events created while a batch is in flight are retained. Unacknowledged batches retry every 10 seconds, including after reconnects, and duplicate event IDs are ignored by the database.

Deploy API version 0.4.1 or later before flashing this firmware. `/health` reports `controllerEventsOverWebSocket: true` when the new event protocol is available. The HTTP event endpoint is retained for older firmware.

Connection failures retry with increasing delays capped at 60 seconds. A Wi-Fi disconnect explicitly releases the old socket; reconnecting performs authentication and a full sync again. Authentication has a 15-second deadline, and missing application heartbeat acknowledgements trigger recovery after 90 seconds. Network recovery waits until an active BLE exchange or unlock pulse finishes.

For troubleshooting, capture the `Backend connect attempt` and `Backend TCP/TLS connect failed` lines. They include the actual TLS error, elapsed time, free heap and largest allocatable block. The previous `TCP connection cleanup` text alone did not distinguish a TCP failure from a TLS failure. In Arduino IDE, select **Core Debug Level: Error** for additional ESP32 TLS diagnostics; CI enables this automatically. Never include the controller token in shared logs.

## Reopen phone pairing

In the dashboard, open **Smart locks** and click **Enable pairing** beside an online
controller. An administrator session is required. The backend sends an authenticated
WebSocket command and waits for the controller to confirm that its two-minute pairing
window is open. Use the configured six-digit pairing PIN in the Android app.
No controller restart is needed. Existing enrolled phones continue working after
pairing closes. Pairing lockout after repeated incorrect PINs remains enforced.

Deploy the updated API and dashboard and flash this firmware to use the action.
Older firmware does not acknowledge the command; the dashboard reports an error
instead of claiming that pairing is enabled. Offline requests are rejected, not queued.

## Hardware behavior

- BLE name: `LOCK-<device-id>`
- Relay: GPIO 33, active-high on the final relay module
- Buzzer: GPIO 14
- Common-cathode RGB LED: GPIO 27 / 26 / 25
- Pairing window: 120 seconds after boot
- Unlock pulse: five seconds
- Up to 48 access credentials cached in NVS
- Up to 24 audit events queued in NVS
