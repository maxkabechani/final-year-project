# BLE Smart Door Access System

Final-year project for controlled, logged access to the University of Zambia Computing and Informatics Department CL3 laboratory.

The controller authorizes access locally over BLE. It checks a one-time challenge response, a local biometric confirmation on the phone, and the user's timetable against its RTC. Network connectivity is used for administration and log synchronization only; it is not required to unlock the door.

## Repository layout

- firmware: ESP32-32S controller firmware for BLE, the relay and strike, door contact, exit button, LCD, RTC, LEDs, buzzer, offline user records, and event queue.
- mobile: Flutter Android app for biometric confirmation, BLE access, account provisioning, and administrator actions.
- backend: TypeScript/Fastify API and small web dashboard for devices, users, schedules, and event logs.
- docs: BLE and cryptographic protocol shared by the app and firmware.

## Build an installable APK

Every push and pull request runs the Android build in GitHub Actions. Open the Actions tab, select the latest Project CI run, and download the CL3-Access-APK artifact. It contains an installable debug APK; Android may ask you to allow installation from the browser or file manager.

## Quick start

1. Start PostgreSQL and configure backend/.env from backend/.env.example.
2. Start the backend with npm install and npm run dev from backend.
3. Open the dashboard at /admin and register a controller.
4. Copy its device ID and device token into firmware/include/cl3_local_config.h, then flash the ESP32.
5. Install the APK and enter the API URL and administrator token. Create a user in the app, or create one in the dashboard and import its credential JSON into the app.
6. Hold the controller exit button for five seconds, enter the LCD pairing PIN, and enroll the phone.
7. Tap Unlock. The phone asks for a biometric, authenticates over BLE, and the controller checks the stored timetable. This flow continues to work without Wi-Fi.

See firmware/README.md, mobile/README.md, backend/README.md, and docs/protocol.md for wiring, setup, and protocol details.

## Hardware baseline

The current build targets the 38-pin ESP32-32S, low-level-trigger 5 V relay module, fail-secure 12 V electric strike, MC-38 normally-closed door contact, normally-open exit button, DS3231 RTC, 16x2 I2C LCD, common-cathode RGB LED, and active buzzer. RFID and the servo in the early prototype are outside the current BLE-door build.

This is a prototype for a supervised laboratory demonstration. Test the controller with the strike disconnected before connecting the 12 V lock circuit.
