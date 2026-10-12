import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function initializeDatabase(): Promise<void> {
  const schema = [
    'CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    'CREATE TABLE IF NOT EXISTS access_users (user_id UUID PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE, name TEXT NOT NULL, credential_ciphertext TEXT NOT NULL, days_mask SMALLINT NOT NULL CHECK (days_mask BETWEEN 1 AND 127), start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439), end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440), valid_from BIGINT NOT NULL, valid_until BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ, CHECK (start_minute < end_minute))',
    'CREATE INDEX IF NOT EXISTS access_users_device_idx ON access_users(device_id)',
    'CREATE TABLE IF NOT EXISTS access_events (event_id UUID PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE, occurred_at TIMESTAMPTZ NOT NULL, event_type TEXT NOT NULL, user_id UUID, detail TEXT NOT NULL DEFAULT \'\')',
    'CREATE INDEX IF NOT EXISTS access_events_device_time_idx ON access_events(device_id, occurred_at DESC)',
  ].join(';');
  await pool.query(schema);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
