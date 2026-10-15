# ESP32 smart-lock controller

This PlatformIO Arduino project targets the 38-pin ESP32-32S used by the final presentation hardware.

The presentation firmware intentionally uses only the hardware that is actually fitted:

- ESP32-32S
- active-low relay on GPIO 33
- active buzzer on GPIO 14
- common-cathode RGB status LED on GPIO 27/26/25
- BLE phone access

There is no LCD, DS3231 RTC, door-contact input, or exit-button input in the current firmware.

## What the firmware does

- Advertises over BLE as `LOCK-<device-id>`.
- Opens a 120-second pairing window automatically after boot.
- Uses the six-digit `SMART_LOCK_PAIRING_PIN` during enrollment.
- Uses P-256 ECDH, AES-128-GCM, and HMAC proof checks for BLE sessions.
- Stores authorized users and queued audit events in ESP32 NVS.
- Checks recurring and one-off access windows locally.
- Pulses the relay active-low for five seconds after a valid unlock.
- Uses the RGB LED and buzzer for status feedback.
- Syncs time, authorized users, and queued events with the Fastify backend every 60 seconds when Wi-Fi and HTTPS are configured.
- Continues BLE authorization offline using the cached user table and software clock.

The internal protocol strings still contain the historical `CL3-...` version labels because the Android app uses the same protocol constants. They are wire-protocol identifiers, not the product name.

## Build and flash with PlatformIO

1. Install PlatformIO Core or the VS Code PlatformIO extension.
2. Copy `include/config.example.h` to `include/smart_lock_local_config.h`.
3. Register the smart lock in the dashboard.
4. Put its controller ID and one-time device token into `smart_lock_local_config.h`.
5. Add Wi-Fi, public backend URL, the backend TLS root CA, and a six-digit pairing PIN.
6. Connect the ESP32 by USB.
7. Run:

```bash
pio run -d firmware
pio run -d firmware -t upload
pio device monitor -b 115200
```

## Configuration

The firmware needs these values for a fully connected controller:

```cpp
#define SMART_LOCK_DEVICE_ID "front-door-01"
#define SMART_LOCK_WIFI_SSID "..."
#define SMART_LOCK_WIFI_PASSWORD "..."
#define SMART_LOCK_BACKEND_URL "https://api.example.com"
#define SMART_LOCK_DEVICE_TOKEN "..."
#define SMART_LOCK_PAIRING_PIN "246810"
#define SMART_LOCK_BACKEND_ROOT_CA R"EOF(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)EOF"
```

If backend/Wi-Fi configuration is omitted, BLE still starts, but the controller cannot fetch server time or synchronize access grants and events.

## Wiring

| Function | ESP32 GPIO | Behaviour |
|---|---:|---|
| Relay IN | 33 | Active-low; HIGH is locked/off |
| Active buzzer | 14 | Status feedback through the transistor driver |
| RGB red | 27 | Common-cathode RGB LED |
| RGB green | 26 | Common-cathode RGB LED |
| RGB blue | 25 | Common-cathode RGB LED |

The strike must be powered from a supply appropriate for the lock and switched through the relay COM/NO contacts. Do not power the strike from an ESP32 GPIO.

## Time behaviour

There is no physical RTC in the final controller.

The ESP32 maintains a software UTC clock while powered. It is initialized from the authenticated backend time endpoint when network access is available. A stored last-known time is restored after reboot so the controller can come up without an RTC, then the backend corrects it on the next successful sync.

Scheduled access fails closed if the controller does not have a valid time.

## Storage limits

- Up to 48 cached authorized users.
- Up to 24 queued audit events.
- Users and queued events survive reboot through ESP32 NVS.

## Arduino IDE

`src/main.cpp` is the application source, but it is not a completely standalone Arduino sketch because it expects the configuration header and the NimBLE-Arduino and ArduinoJson libraries.

For the quickest reliable upload, open the whole `firmware` folder as a PlatformIO project. If Arduino IDE must be used, copy the source into an `.ino` sketch, keep the configuration defines available to the sketch, install the two external libraries, select **ESP32 Dev Module**, then verify and upload.
