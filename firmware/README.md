# ESP32 controller

This PlatformIO Arduino project targets the ESP32-32S 38-pin board. It implements the BLE GATT protocol in docs/protocol.md, one-time P-256 ECDH sessions, HKDF-SHA256, AES-128-GCM, user HMAC proofs, local timetable checks, a five-second active-low relay pulse, exit-button egress, a physical pairing window, LCD status, RGB indication, buzzer feedback, local user storage, and a queued event log.

## Build and flash

1. Install PlatformIO Core or the VS Code PlatformIO extension.
2. Copy include/config.example.h to include/cl3_local_config.h.
3. Register the controller with the backend and copy its device ID and one-time device token into cl3_local_config.h.
4. Set Wi-Fi, backend URL, and trusted root CA values if server time, timetable sync, and log upload are required.
5. Connect the ESP32 over USB, then run pio run -d firmware and pio run -d firmware -t upload.

The controller can obtain UTC from the authenticated backend time endpoint. During first-time offline enrollment, the phone's valid-from timestamp initializes an invalid RTC. After a valid UTC time is stored, BLE authorization and schedules continue offline. The controller fails closed for scheduled access when its RTC is not valid; the physical exit button remains available.

## Wiring baseline

| Function | ESP32 GPIO | Notes |
|---|---:|---|
| I2C SDA | 21 | Shared LCD and DS3231 bus |
| I2C SCL | 22 | Shared LCD and DS3231 bus |
| Relay input | 33 | Active-low, HIGH means strike locked |
| NC door contact | 32 | Contact to ground while door is closed |
| NO exit button | 19 | Button to ground; press unlocks immediately |
| Active buzzer | 14 | Drive through a transistor if its current exceeds GPIO limits |
| RGB red | 27 | Common-cathode LED with a series resistor per color |
| RGB green | 26 | Common-cathode LED with a series resistor per color |
| RGB blue | 25 | Common-cathode LED with a series resistor per color |

Power the 12 V fail-secure strike from its own 12 V supply through the relay COM and NO contacts. Power the ESP32 VIN, relay module logic, LCD, and RTC from a regulated 5 V LM2596 output sized for the load. Join logic grounds and the relay module ground. Keep strike current out of the ESP32 and breadboard logic wiring. If the LCD/RTC I2C pull-ups go to 5 V, fit a bidirectional I2C level shifter between them and the ESP32.

Verify relay polarity with the strike disconnected: power-up must leave the relay de-energized, and only a valid authorization or exit-button press may energize it. Confirm the lock's fail-secure behavior and emergency egress requirements with the lab supervisor before connecting the strike.

## Notes

- The event queue and active user table are stored in ESP32 NVS and survive reboot.
- The device caches up to 48 users locally. If a sync would exceed that limit or fail validation, the previous table is kept.
- Network synchronization requires a valid HTTPS root CA; TLS verification is never disabled.
- The backend is optional for the actual unlock decision. A network or API outage does not disable enrolled BLE access.
- Secure Boot and flash encryption eFuse provisioning are not enabled by the PlatformIO build. They require a board-specific key ceremony and must be applied only after the firmware and recovery process have been validated on the physical controller.
