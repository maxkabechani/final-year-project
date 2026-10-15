# BLE Smart Door Access System

Final-year project for controlled, logged access to the University of Zambia Computing and Informatics Department CL3 laboratory.

The controller authorizes access locally over BLE. It checks a one-time challenge response, biometric confirmation on the Android phone, and the user's timetable. Network connectivity is used for administration and log synchronization; an enrolled user can still unlock offline.

## Repository layout

- `frontend`: TanStack Start + React 19 administration dashboard. It uses TanStack Router, Query and Table and is built/run with Bun.
- `backend`: Fastify TypeScript API running with Bun and PostgreSQL for controllers, access policy, credentials and audit events.
- `mobile`: Flutter Android app for biometric confirmation, BLE access and credential provisioning.
- `firmware`: ESP32-32S controller firmware for BLE authorization and door hardware.
- `docs`: BLE and cryptographic protocol shared by the app and firmware.

## Web architecture

The dashboard and API are separate deployable applications.

- Dashboard: port 3000
- Fastify API: port 8080
- PostgreSQL: private Docker network only

The dashboard keeps its API URL and administrator token in the browser for this prototype. The Fastify API accepts dashboard requests only from origins configured in `CORS_ORIGIN`.

## Docker / Dokploy

The repository root contains a Compose stack with `web`, `api`, and `db` services. Configure these deployment variables:

- `POSTGRES_PASSWORD`
- `ADMIN_TOKEN` (at least 24 characters)
- `CREDENTIAL_MASTER_KEY` (64 hexadecimal characters)
- `FRONTEND_ORIGIN` (for example `https://access.example.com`)
- `API_PUBLIC_URL` (for example `https://access-api.example.com`)

Route the frontend domain to service `web` port 3000 and the API domain to service `api` port 8080.

## Build an installable APK

Every push and pull request runs the Android build in GitHub Actions. Open the Actions tab, select the latest Project CI run, and download the `CL3-Access-APK` artifact.

## Hardware baseline

The build targets the 38-pin ESP32-32S, low-level-trigger 5 V relay module, fail-secure electric strike, door contact, exit button, RGB status LED and active buzzer. The hardware can be demonstrated incrementally while the full controller peripherals are completed.
