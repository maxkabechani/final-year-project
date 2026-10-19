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
- `POST /api/devices/:deviceId/pairing`: administrator session required; reopen BLE pairing for 120 seconds on a connected controller. Success is returned only after the controller acknowledges the command. Offline, busy, locked-out, and unresponsive controllers return HTTP 409.
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

Controllers connect to `/ws/device/:deviceId`, send `{ type: "auth", token }`, and receive a full `sync` containing server time and access grants. Messages are handled in arrival order so an immediate heartbeat or event batch waits for authentication. Unauthenticated connections expire after 15 seconds; server ping/pong checks remove broken transports. Incoming frames are limited to 16 KiB.

The current firmware sends `{ type: "events", requestId, events }` over that authenticated connection, using the same event objects as the HTTP endpoint. `events_ack` echoes `requestId` and the committed `eventIds`. The controller can safely retry after a lost acknowledgement or reconnect: event IDs are deduplicated transactionally. Deploy this API before updating controller firmware; `/health` exposes `controllerEventsOverWebSocket: true`.
- `PATCH /api/people/:personId`: administrator session required; update a person's name and student number in place. Blank or null student numbers are stored as missing. Existing person ID, credentials, phone sessions, and grants are preserved. Duplicate student numbers return HTTP 409.
- `PATCH /api/devices/:deviceId`: update lock name/location while preserving the controller ID/token.
- `DELETE /api/devices/:deviceId`: delete the lock, its assignments and device-specific activity history; invalidate its token and close its controller sockets.
- `DELETE /api/people/:personId`: delete the identity, phone sessions, legacy enrollment rows and grants; push refreshed permissions to connected affected locks. Offline locks apply revocations after reconnecting.
- `PATCH /api/access-grants/:grantId`: edit an existing assignment's schedule without changing its person or lock.
- `PATCH /api/admins/:adminId`: owner-only update of name, email and role. A role change revokes the target's sessions.
- `DELETE /api/admins/:adminId`: owner-only account deletion and session invalidation. Self-deletion and removing the last owner are rejected. Raw Better Auth admin HTTP endpoints are blocked so these checks cannot be bypassed.

Dashboard deletions require confirmation. Student identity creation remains in the Android app registration flow; administrators can edit or delete the resulting identity. Activity events have no standalone edit/delete operations.

The backend CI job starts an isolated PostgreSQL database and runs `bun run test:integration`
against the running API. Locally, set `DATABASE_URL` to a disposable database whose name
ends in `_test`, start this API against that same database, and run the command with
`TEST_API_URL` pointing to its local origin. The suite requires the bootstrap owner's
`BETTER_AUTH_OWNER_EMAIL` and `BETTER_AUTH_OWNER_PASSWORD`. It verifies CRUD, session
invalidation, controller permission updates, legacy migration cleanup, and concurrent
last-owner protection. Never point this suite at a shared development or production database.
