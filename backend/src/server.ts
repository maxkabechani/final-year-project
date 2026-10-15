import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import {
  constantTimeHexEqual,
  decryptCredentialHex,
  encryptCredentialHex,
  newCredential,
  newDeviceToken,
  sameSecret,
  tokenHash,
} from './crypto.js';
import { closeDatabase, initializeDatabase, pool } from './database.js';

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });
const adminToken = process.env.ADMIN_TOKEN ?? '';
const masterKey = process.env.CREDENTIAL_MASTER_KEY ?? '';
const port = Number(process.env.PORT ?? '8080');

const deviceIdSchema = z.string().min(3).max(20).regex(/^[A-Za-z0-9._-]+$/);
const scheduleSchema = z.object({
  daysMask: z.number().int().min(1).max(127),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  validFrom: z.number().int().nonnegative(),
  validUntil: z.number().int().positive().nullable(),
}).refine((value) => value.startMinute < value.endMinute, {
  message: 'End time must be after start time',
  path: ['endMinute'],
});

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!sameSecret(bearer(request), adminToken)) {
    await reply.code(401).send({ error: 'Administrator authentication required' });
  }
}

async function requireDevice(
  request: FastifyRequest<{ Params: { deviceId: string } }>,
  reply: FastifyReply,
): Promise<boolean> {
  const result = await pool.query<{ token_hash: string }>(
    'SELECT token_hash FROM devices WHERE device_id = $1',
    [request.params.deviceId],
  );
  const row = result.rows[0];
  const supplied = bearer(request);
  if (!row || !constantTimeHexEqual(tokenHash(supplied), row.token_hash)) {
    await reply.code(401).send({ error: 'Device authentication failed' });
    return false;
  }
  return true;
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    void reply.code(400).send({ error: 'Invalid request', details: error.issues });
    return;
  }
  const errorObject = typeof error === 'object' && error !== null
    ? error as { code?: unknown; statusCode?: unknown; message?: unknown }
    : undefined;
  if (errorObject?.code === '23505') {
    void reply.code(409).send({ error: 'That controller or event is already registered' });
    return;
  }
  app.log.error(error);
  const status = typeof errorObject?.statusCode === 'number'
    ? errorObject.statusCode
    : 500;
  void reply.code(status).send({
    error: status >= 500
      ? 'Internal server error'
      : error instanceof Error
          ? error.message
          : String(errorObject?.message ?? 'Request failed'),
  });
});

const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

await app.register(cors, {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'), false);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'accept'],
});

app.get('/', async () => ({
  service: 'CL3 Smart Access API',
  version: '0.2.0',
  health: '/health',
}));
app.get('/health', async () => ({ ok: true }));

app.get('/api/devices', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(
    'SELECT device_id AS "deviceId", name, created_at AS "createdAt" FROM devices ORDER BY created_at DESC',
  );
  return { devices: result.rows };
});

app.post('/api/devices', { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({
    deviceId: deviceIdSchema,
    name: z.string().trim().min(1).max(120),
  }).parse(request.body);
  const deviceToken = newDeviceToken();
  await pool.query(
    'INSERT INTO devices(device_id, name, token_hash) VALUES($1, $2, $3)',
    [body.deviceId, body.name, tokenHash(deviceToken)],
  );
  return reply.code(201).send({ deviceId: body.deviceId, deviceToken });
});

app.post<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/users',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const body = z.object({
      name: z.string().trim().min(1).max(120),
      schedule: scheduleSchema,
    }).parse(request.body);
    const exists = await pool.query('SELECT 1 FROM devices WHERE device_id = $1', [deviceId]);
    if (exists.rowCount === 0) {
      return reply.code(404).send({ error: 'Controller not registered' });
    }
    const userId = randomUUID();
    const credentialHex = newCredential().toString('hex');
    const schedule = body.schedule;
    await pool.query(
      'INSERT INTO access_users(user_id, device_id, name, credential_ciphertext, days_mask, start_minute, end_minute, valid_from, valid_until) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        userId,
        deviceId,
        body.name,
        encryptCredentialHex(credentialHex, masterKey),
        schedule.daysMask,
        schedule.startMinute,
        schedule.endMinute,
        schedule.validFrom,
        schedule.validUntil,
      ],
    );
    return reply.code(201).send({
      userId,
      credentialKeyHex: credentialHex,
      schedule,
    });
  },
);

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/users',
  { preHandler: requireAdmin },
  async (request) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const result = await pool.query(
      'SELECT user_id AS "userId", name, days_mask AS "daysMask", start_minute AS "startMinute", end_minute AS "endMinute", valid_from AS "validFrom", valid_until AS "validUntil" FROM access_users WHERE device_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
      [deviceId],
    );
    return {
      users: result.rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        schedule: {
          daysMask: Number(row.daysMask),
          startMinute: Number(row.startMinute),
          endMinute: Number(row.endMinute),
          validFrom: Number(row.validFrom),
          validUntil: row.validUntil === null ? null : Number(row.validUntil),
        },
      })),
    };
  },
);

app.delete<{ Params: { deviceId: string; userId: string } }>(
  '/api/devices/:deviceId/users/:userId',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const userId = z.string().uuid().parse(request.params.userId);
    const result = await pool.query(
      'UPDATE access_users SET revoked_at = now() WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [deviceId, userId],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Active user not found' });
    }
    return reply.code(204).send();
  },
);

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/events',
  { preHandler: requireAdmin },
  async (request) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const result = await pool.query(
      'SELECT event_id AS "eventId", occurred_at AS "occurredAt", event_type AS type, user_id AS "userId", detail FROM access_events WHERE device_id = $1 ORDER BY occurred_at DESC LIMIT 200',
      [deviceId],
    );
    return { events: result.rows };
  },
);

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/sync',
  async (request, reply) => {
    if (!(await requireDevice(request, reply))) return;
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const result = await pool.query(
      'SELECT user_id AS "userId", credential_ciphertext AS ciphertext, days_mask AS "daysMask", start_minute AS "startMinute", end_minute AS "endMinute", valid_from AS "validFrom", valid_until AS "validUntil" FROM access_users WHERE device_id = $1 AND revoked_at IS NULL ORDER BY created_at',
      [deviceId],
    );
    return {
      users: result.rows.map((row) => ({
        userId: row.userId,
        credentialKeyHex: decryptCredentialHex(row.ciphertext, masterKey),
        schedule: {
          daysMask: Number(row.daysMask),
          startMinute: Number(row.startMinute),
          endMinute: Number(row.endMinute),
          validFrom: Number(row.validFrom),
          validUntil: row.validUntil === null ? null : Number(row.validUntil),
        },
      })),
    };
  },
);

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/time',
  async (request, reply) => {
    if (!(await requireDevice(request, reply))) return;
    return { unixSeconds: Math.floor(Date.now() / 1000) };
  },
);

const eventSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  type: z.enum(['granted', 'denied', 'exit', 'door_open', 'door_closed', 'enrolled']),
  userId: z.string().uuid().nullable().optional(),
  detail: z.string().max(240).default(''),
});

app.post<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/events',
  async (request, reply) => {
    if (!(await requireDevice(request, reply))) return;
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const body = z.object({ events: z.array(eventSchema).max(100) }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of body.events) {
        await client.query(
          'INSERT INTO access_events(event_id, device_id, occurred_at, event_type, user_id, detail) VALUES($1, $2, $3, $4, $5, $6) ON CONFLICT(event_id) DO NOTHING',
          [
            event.eventId,
            deviceId,
            event.occurredAt,
            event.type,
            event.userId ?? null,
            event.detail,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return reply.code(202).send({ accepted: body.events.length });
  },
);

app.addHook('onClose', async () => closeDatabase());

async function start(): Promise<void> {
  if (adminToken.length < 24) {
    throw new Error('Set ADMIN_TOKEN to at least 24 characters');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL before starting the backend');
  }
  if (!/^[0-9a-f]{64}$/i.test(masterKey)) {
    throw new Error('Set CREDENTIAL_MASTER_KEY to 64 hex characters');
  }
  await initializeDatabase();
  await app.listen({ host: '0.0.0.0', port });
}

start().catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});

process.on('SIGINT', () => void app.close());
process.on('SIGTERM', () => void app.close());
