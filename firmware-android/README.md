# Smart Access firmware for ArduinoDroid

This folder contains the Android-friendly firmware for the final presentation controller:

`SmartAccessLock/SmartAccessLock.ino`

The configuration is at the top of the sketch so it is easy to flash directly from an Android phone.

## ArduinoDroid setup

1. Install the ESP32 board support in ArduinoDroid.
2. Use **ESP32 Arduino core 2.0.17** if ArduinoDroid lets you choose the version.
3. Install **ArduinoJson** from the Library Manager.
4. Do **not** install/use NimBLE-Arduino for this sketch. The Android build now uses the ESP32 core's built-in BLE library, following the same BLE pattern as SunFounder's working example.
5. Open `SmartAccessLock.ino`.
6. Select **ESP32 Dev Module**.
7. Connect the ESP32 to the phone using USB OTG.
8. Tap **Compile**, then **Upload**.

## First BLE test

The default controller configuration is:

- controller ID: `front-door-01`
- BLE name: `LOCK-front-door-01`
- pairing PIN: `246810`
- relay: GPIO 33, active-high
- buzzer: GPIO 14
- RGB: GPIO 27 / 26 / 25

Leave Wi-Fi and device token blank if you only want to verify BLE advertising first.

After uploading, press **EN/RESET**. The controller should advertise as:

`LOCK-front-door-01`

The Smart Access Android app scans for `LOCK-` devices and then verifies the Smart Access service UUID before attempting an unlock. The firmware explicitly advertises the service UUID and uses a scan response so Android/Flutter scanners can reliably receive the controller name.

## Connected mode

For the full dashboard-to-lock flow, edit the configuration block at the top of the sketch and provide:

- Wi-Fi SSID/password
- controller token from the dashboard

The backend URL is already set to `https://api-project.maxkabechani.dev`. The controller uses HTTPS directly; there is no CA certificate field to configure.

The controller must sync grants/time from the backend before the current simplified mobile app can perform an authorized offline BLE unlock.
