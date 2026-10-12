# Backend

The Fastify API manages controller registration, user credentials and timetables, and audit events. PostgreSQL stores records. Device bearer tokens are stored as SHA-256 hashes; 32-byte user credentials are encrypted at rest with AES-256-GCM using CREDENTIAL_MASTER_KEY.

## Run locally

1. Copy backend/.env.example to backend/.env.
2. Replace ADMIN_TOKEN and CREDENTIAL_MASTER_KEY with private random values.
3. Run docker compose up --build from the repository root.
4. Open http://localhost:8080/admin.

For direct Node development, run PostgreSQL locally and change DATABASE_URL to its address, then run npm install, npm run dev, npm run typecheck, and npm test from this directory. Use Node 22 or later.

## API outline

- POST /api/devices (administrator): register a controller and return its one-time device token.
- GET /api/devices (administrator): list controllers.
- POST /api/devices/:deviceId/users (administrator): create a user, key, and local timetable.
- GET /api/devices/:deviceId/users (administrator): list active users and schedules.
- DELETE /api/devices/:deviceId/users/:userId (administrator): revoke a user.
- GET /api/devices/:deviceId/events (administrator): read the latest 200 events.
- GET /api/devices/:deviceId/sync (device token): download active credentials and schedules.
- GET /api/devices/:deviceId/time (device token): set the controller RTC from backend UTC.
- POST /api/devices/:deviceId/events (device token): upload a batch of events. Repeated event IDs are ignored.
- GET /health: health probe.

Configure HTTPS before exposing the API outside a trusted local network. Keep the administrator token and credential master key private and back up the master key separately from the database. Replacing the master key makes stored credentials unreadable.

Door authorization is performed on the ESP32 from its local user list, RTC, and fresh BLE challenge. A backend outage does not stop an enrolled phone from unlocking.
