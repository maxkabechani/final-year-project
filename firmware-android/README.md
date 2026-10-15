# Smart Access firmware for ArduinoDroid

This folder contains a **single Arduino sketch** for the final presentation controller:

`SmartAccessLock/SmartAccessLock.ino`

It is the same Smart Access firmware as the PlatformIO build, but the configuration is at the top of the sketch so it is easier to flash directly from an Android phone.

## ArduinoDroid setup

1. Install the ESP32 board support in ArduinoDroid.
2. Install these two libraries from the Library Manager:
   - `NimBLE-Arduino`
   - `ArduinoJson`
3. Open `SmartAccessLock.ino`.
4. Select **ESP32 Dev Module**.
5. Connect the ESP32 to the phone using a USB OTG adapter/cable.
6. Tap **Compile**, then **Upload**.
7. Open Serial Monitor at **115200 baud** if you want to see pairing and sync messages.

## First test

You do not need Wi-Fi for the first BLE test. The sketch already defaults to:

- controller ID: `front-door-01`
- BLE name: `LOCK-front-door-01`
- pairing PIN: `246810`
- relay: GPIO 33
- buzzer: GPIO 14
- RGB: GPIO 27 / 26 / 25

Leave Wi-Fi and device token blank for the first upload.

In the Android Smart Access app:

1. Use/import a credential for `front-door-01`.
2. Scan and connect to `LOCK-front-door-01`.
3. Enter pairing PIN `246810`.
4. Enroll the phone.
5. Use **Biometric unlock**.

The phone enrollment carries a valid time window, so the ESP32 can initialize its software clock without a physical RTC.

## Connected mode later

For backend synchronization, edit the configuration block at the very top of the sketch and provide:

- Wi-Fi SSID/password
- controller token from the dashboard
- backend root CA certificate

The backend URL is already set to `https://api-project.maxkabechani.dev`.
