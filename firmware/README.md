# Smart Access ESP32 firmware

There is now one controller firmware source in the repository:

`firmware/SmartAccessLock/SmartAccessLock.ino`

Use this same sketch from Arduino IDE, ArduinoDroid, or the GitHub Actions firmware build.

## Arduino setup

Install:

- ESP32 board support by Espressif (CI uses 2.0.17)
- ArduinoJson 7.4.2
- WebSockets by Markus Sattler 2.7.2 (the version pinned in CI)
- hd44780 by Bill Perry 1.3.2 (uses the hd44780_I2Cexp driver; Wire is bundled with ESP32 support)

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

Deploy API version 0.4.2 or later for LCD user names. `/health` reports `controllerDisplayNames: true`. Names are pushed with controller sync and when an administrator renames a person, then cached separately in NVS so existing credentials survive this firmware upgrade. Older APIs still support unlocking, with `Authorized user` shown until name metadata becomes available. The HTTP event endpoint is retained for older firmware.

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
- Exit button: GPIO 19; X3 connects the input to GND when pressed. Populate R11 (10 kΩ to 3V3).
- LCD1602 I2C: SDA GPIO 21, SCL GPIO 22. J4 pins 1–4 are GND, +5V, SDA, SCL. Populate Q3/Q4 (BSS138) and R6–R9 (4.7 kΩ); do not connect 5V I2C pull-ups directly to ESP32 GPIOs.
- Common-cathode RGB LED: GPIO 27 / 26 / 25
- Pairing window: 120 seconds after boot
- Unlock pulse: five seconds
- Up to 48 access credentials cached in NVS
- Up to 24 audit events queued in NVS

## LCD and exit-button behavior

The LCD driver automatically discovers the backpack I2C address and pin mapping. Set `SMART_LOCK_LCD_ENABLED` to `0` to disable it. If detection or a later I2C write fails, the display is disabled until restart; BLE and the exit button continue working. The LCD/buzzer +5V rail needs its own valid 5V supply path: powering the ESP32 over USB may not feed it backwards through D2. Adjust the LCD backpack contrast potentiometer if the backlight is on but text is invisible.

| State | LCD first row | LCD second row |
| --- | --- | --- |
| Ready | Smart Access | Online/Offline and Zambia time |
| Clock not synchronized | Smart Access | Waiting for sync |
| Pairing open | Pairing enabled | PIN: configured PIN |
| Valid BLE unlock | Access granted | Registered person's name |
| Exit release | Exit button | Door unlocked |
| Invalid credential | Access denied | Not authorized |
| Outside schedule | Access denied | Outside schedule |

Unlock results remain visible for 10 seconds. Names longer than 16 characters page across the second row every 1.4 seconds. Display labels are capped at 30 printable ASCII characters to fit the LCD and the existing 48-user WebSocket payload budget. Accented Latin letters are normalized by the backend; unsupported characters appear as `?`. The full original name remains in the dashboard. Names are display metadata only: BLE authentication continues to use the user UUID and cryptographic credential.

The exit input is debounced for 40 ms. Each press generates at most one five-second release; holding the button does not keep the relay energized, and pressing during an existing pulse does not extend it. A button held during startup must be released before it can trigger. Exit release works without a phone, clock sync, or network connection, and is logged as a granted event with no person attached and detail `exit button release`.

A dedicated hardware task polls the button and switches the relay off at its deadline even while the main task is busy with TLS, BLE, flash storage, or LCD communication. If that task cannot be allocated, local polling remains available and networking is disabled to avoid blocking local release handling.

Host regression tests can be run without an ESP32:

```sh
g++ -std=c++11 -Wall -Wextra -Werror firmware/test/hardware_test.cpp -o /tmp/smart-access-hardware-test
/tmp/smart-access-hardware-test
```

