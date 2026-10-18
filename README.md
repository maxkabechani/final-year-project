# Smart Access

Final-year project for controlled and logged access across multiple BLE smart locks.

Smart Access consists of a multi-lock administration dashboard, a Fastify/PostgreSQL backend, an Android BLE app, and ESP32 smart-lock firmware. A person's credential can be granted to one or many doors with recurring or one-off schedules. Unlock decisions are performed locally over BLE after phone biometric confirmation, so enrolled users can still open authorized doors when the network is unavailable.

## Repository layout

- `frontend`: TanStack Start administration dashboard using TanStack Router, Query and Table.
- `backend`: Fastify TypeScript API running with Bun and PostgreSQL.
- `mobile`: Flutter Android app for credential storage, biometric confirmation and BLE unlock.
- `firmware`: PlatformIO source for the ESP32 controller.
- `firmware-android`: single-file Arduino sketch intended for ArduinoDroid and phone-based flashing.
- `docs`: BLE and cryptographic protocol shared by the Android app and firmware.

## Deployment

The web stack uses separate services:

- Dashboard: port 3000
- Fastify API: port 8080
- PostgreSQL: private Docker network only

Production API: `https://api-project.maxkabechani.dev`

## APK

GitHub Actions builds an installable Android debug APK on every push.

Open **Actions → Smart Access CI** and download the artifact:

`Smart-Access-APK`

The file inside the artifact is:

`Smart-Access.apk`

Successful Android builds on `main` also publish the APK as a GitHub Release asset:

https://github.com/maxkabechani/final-year-project/releases/latest/download/Smart-Access.apk

The dashboard's **Download app** button and QR code both use this public download URL;
phones do not need a dashboard or GitHub login to download it. The APK is the project's
debug/demo build. Android may require allowing installation from the browser.
Pull requests do not publish releases. To publish manually, run **Smart Access CI**
with **Run workflow** on `main`. The link becomes available after the first successful
**Publish Android download** job. Dokploy only needs to redeploy the frontend for the
download card; the APK itself is hosted by GitHub.

## Firmware from an Android phone

For the easiest phone-based upload, use:

`firmware-android/SmartAccessLock/SmartAccessLock.ino`

Install **NimBLE-Arduino** and **ArduinoJson** in ArduinoDroid, select **ESP32 Dev Module**, connect the ESP32 by USB OTG, compile, and upload.

The default BLE-only demo configuration uses:

- Device ID: `front-door-01`
- BLE name: `LOCK-front-door-01`
- Pairing PIN: `246810`
- Relay GPIO 33
- Buzzer GPIO 14
- RGB GPIO 27/26/25

Wi-Fi is optional for the first BLE demonstration.
