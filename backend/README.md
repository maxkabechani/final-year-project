# Smart Access Fastify API

TypeScript/Fastify API for Smart Access controllers. Bun is the package manager/runtime and PostgreSQL is the persistent database.

The API is intentionally separate from the TanStack frontend in `../frontend`.

## Development

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `ADMIN_TOKEN`, `CREDENTIAL_MASTER_KEY`, and `CORS_ORIGIN`.
3. Run `bun install`.
4. Run `bun run dev`.

The API listens on port 8080 by default.

## API

- `POST /api/devices`: register a controller and return its one-time device token.
- `GET /api/devices`: list controllers.
- `POST /api/devices/:deviceId/users`: issue a credential and timetable.
- `GET /api/devices/:deviceId/users`: list active users.
- `DELETE /api/devices/:deviceId/users/:userId`: revoke a user.
- `GET /api/devices/:deviceId/events`: read the latest 200 events.
- `GET /api/devices/:deviceId/sync`: controller credential/timetable sync.
- `GET /api/devices/:deviceId/time`: controller UTC source.
- `POST /api/devices/:deviceId/events`: controller audit upload.
- `GET /health`: health probe.

Administrative endpoints use the `ADMIN_TOKEN` bearer token. Device endpoints use the one-time token created when a controller is registered.

Door authorization remains local to the ESP32 after synchronization so a backend outage does not disable enrolled BLE access.
