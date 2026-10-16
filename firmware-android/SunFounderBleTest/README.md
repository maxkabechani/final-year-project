# SunFounder-style BLE test

This is a minimal BLE visibility test based on the structure used in SunFounder's ESP32 Starter Kit **7.1 Bluetooth** example.

It intentionally uses the ESP32 Arduino core BLE library:

- `BLEDevice.h`
- `BLEServer.h`
- `BLEUtils.h`
- `BLE2902.h`

It does **not** use NimBLE-Arduino.

## Test

1. In ArduinoDroid, open `SunFounderBleTest.ino`.
2. Select **ESP32 Dev Module**.
3. Compile and upload.
4. Press EN/RESET.
5. Open LightBlue on Android and scan.
6. Look for **ESP32_Bluetooth**.

If this device appears, the ESP32 BLE radio and ArduinoDroid core BLE stack are working.

If it does not appear, check the ESP32 board-core version. SunFounder specifically recommends **ESP32 Arduino core 2.0.17** for their Bluetooth examples when the 3.x core causes compatibility problems.
