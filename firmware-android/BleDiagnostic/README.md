# BLE Diagnostic

Use this sketch only to verify that the ESP32 is actually running and advertising Bluetooth correctly from ArduinoDroid.

1. Disconnect the electric strike/load from the relay while diagnosing.
2. Open `BleDiagnostic.ino` in ArduinoDroid.
3. This test uses the ESP32 core's built-in `BLEDevice` library, not NimBLE-Arduino.
4. Compile and upload using **ESP32 Dev Module**.
5. Press EN/RESET after upload.

Expected behaviour:
- relay output is forced OFF (GPIO 33 HIGH for the active-low relay)
- buzzer chirps once
- external blue RGB LED blinks once per second
- BLE advertises as `LOCK-front-door-01`
- Smart Access or any BLE scanner should be able to see it

If this diagnostic advertises but the full firmware does not, the ArduinoDroid ESP32/NimBLE combination is the compatibility problem.
