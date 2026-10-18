import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function initializeDatabase(): Promise<void> {
  const schema = [
    `CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ
    )`,
    `ALTER TABLE devices ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`,

    // Kept for compatibility with deployments created by the first prototype.
    `CREATE TABLE IF NOT EXISTS access_users (
      user_id UUID PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      credential_ciphertext TEXT NOT NULL,
      days_mask SMALLINT NOT NULL CHECK (days_mask BETWEEN 1 AND 127),
      start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
      end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
      valid_from BIGINT NOT NULL,
      valid_until BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      CHECK (start_minute < end_minute)
    )`,
    `CREATE INDEX IF NOT EXISTS access_users_device_idx ON access_users(device_id)`,

    `CREATE TABLE IF NOT EXISTS people (
      person_id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      student_number TEXT,
      credential_ciphertext TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE people ADD COLUMN IF NOT EXISTS student_number TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS people_student_number_unique
      ON people(student_number) WHERE student_number IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS mobile_sessions (
      session_id UUID PRIMARY KEY,
      person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
      installation_id UUID NOT NULL UNIQUE,
      device_label TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mobile_sessions_person_idx
      ON mobile_sessions(person_id)`,
    `CREATE TABLE IF NOT EXISTS access_grants (
      grant_id UUID PRIMARY KEY,
      person_id UUID NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      access_type TEXT NOT NULL DEFAULT 'recurring' CHECK (access_type IN ('recurring', 'one_off')),
      days_mask SMALLINT NOT NULL CHECK (days_mask BETWEEN 1 AND 127),
      start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
      end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
      valid_from BIGINT NOT NULL,
      valid_until BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      CHECK (start_minute < end_minute),
      UNIQUE (person_id, device_id)
    )`,
    `CREATE INDEX IF NOT EXISTS access_grants_device_idx
      ON access_grants(device_id) WHERE revoked_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS access_grants_person_idx
      ON access_grants(person_id) WHERE revoked_at IS NULL`,

    `CREATE TABLE IF NOT EXISTS access_events (
      event_id UUID PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      occurred_at TIMESTAMPTZ NOT NULL,
      event_type TEXT NOT NULL,
      user_id UUID,
      detail TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS access_events_device_time_idx
      ON access_events(device_id, occurred_at DESC)`,

    // One-time migration from the original device-scoped access_users model.
    `INSERT INTO people(person_id, name, credential_ciphertext, created_at)
      SELECT user_id, name, credential_ciphertext, created_at
      FROM access_users
      ON CONFLICT (person_id) DO NOTHING`,
    `INSERT INTO access_grants(
        grant_id, person_id, device_id, access_type, days_mask,
        start_minute, end_minute, valid_from, valid_until, created_at, revoked_at
      )
      SELECT
        user_id, user_id, device_id, 'recurring', days_mask,
        start_minute, end_minute, valid_from, valid_until, created_at, revoked_at
      FROM access_users
      ON CONFLICT (person_id, device_id) DO NOTHING`,
  ].join(';');

  await pool.query(schema);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
