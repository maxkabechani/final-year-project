import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
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

const deviceIdSchema = z.string().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/);
const accessTypeSchema = z.enum(['recurring', 'one_off']);
const scheduleSchema = z.object({
  accessType: accessTypeSchema.default('recurring'),
  daysMask: z.number().int().min(1).max(127),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  validFrom: z.number().int().nonnegative(),
  validUntil: z.number().int().positive().nullable(),
}).superRefine((value, ctx) => {
  if (value.startMinute >= value.endMinute) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End time must be after start time',
      path: ['endMinute'],
    });
  }
  if (value.accessType === 'one_off' && value.validUntil === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'One-off access requires an expiry time',
      path: ['validUntil'],
    });
  }
  if (value.validUntil !== null && value.validUntil <= value.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expiry must be after the start time',
      path: ['validUntil'],
    });
  }
});

type AdminSocket = {
  readyState: number;
  send(payload: string): void;
  close(): void;
  on(event: 'message', listener: (payload: Buffer | string) => void): void;
  on(event: 'close' | 'error', listener: () => void): void;
};

const adminSockets = new Set<AdminSocket>();

function broadcast(type: string, payload: Record<string, unknown> = {}): void {
  const message = JSON.stringify({ type, ...payload });
  for (const socket of adminSockets) {
    if (socket.readyState === 1) {
      socket.send(message);
    } else {
      adminSockets.delete(socket);
    }
  }
}

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
  await pool.query(
    'UPDATE devices SET last_seen_at = now() WHERE device_id = $1',
    [request.params.deviceId],
  );
  broadcast('device_seen', { deviceId: request.params.deviceId });
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
    void reply.code(409).send({ error: 'That record already exists' });
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

await app.register(websocket);

app.get('/ws/admin', { websocket: true }, (rawSocket) => {
  const socket = rawSocket as unknown as AdminSocket;
  let authenticated = false;

  const authTimeout = setTimeout(() => {
    if (!authenticated) socket.close();
  }, 5_000);

  socket.on('message', (payload) => {
    try {
      const value = JSON.parse(payload.toString()) as { type?: unknown; token?: unknown };
      if (value.type !== 'auth' || typeof value.token !== 'string') return;
      if (!sameSecret(value.token, adminToken)) {
        socket.send(JSON.stringify({ type: 'auth_error' }));
        socket.close();
        return;
      }
      authenticated = true;
      clearTimeout(authTimeout);
      adminSockets.add(socket);
      socket.send(JSON.stringify({ type: 'ready' }));
    } catch {
      socket.close();
    }
  });

  const cleanup = () => {
    clearTimeout(authTimeout);
    adminSockets.delete(socket);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

app.get('/', async () => ({
  service: 'Smart Lock Access API',
  version: '0.3.0',
  health: '/health',
}));
app.get('/health', async () => ({ ok: true }));

app.get('/api/devices', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(
    `SELECT
       device_id AS "deviceId",
       name,
       location,
       created_at AS "createdAt",
       last_seen_at AS "lastSeenAt",
       (last_seen_at IS NOT NULL AND last_seen_at > now() - interval '90 seconds') AS online
     FROM devices
     ORDER BY created_at DESC`,
  );
  return { devices: result.rows };
});

app.post('/api/devices', { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({
    deviceId: deviceIdSchema,
    name: z.string().trim().min(1).max(120),
    location: z.string().trim().max(160).default(''),
  }).parse(request.body);
  const deviceToken = newDeviceToken();
  await pool.query(
    'INSERT INTO devices(device_id, name, location, token_hash) VALUES($1, $2, $3, $4)',
    [body.deviceId, body.name, body.location, tokenHash(deviceToken)],
  );
  broadcast('devices_changed', { deviceId: body.deviceId });
  return reply.code(201).send({
    deviceId: body.deviceId,
    deviceToken,
  });
});

app.get('/api/people', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(
    `SELECT
       p.person_id AS "personId",
       p.name,
       p.created_at AS "createdAt",
       COUNT(g.grant_id) FILTER (WHERE g.revoked_at IS NULL)::int AS "activeLocks"
     FROM people p
     LEFT JOIN access_grants g ON g.person_id = p.person_id
     GROUP BY p.person_id
     ORDER BY p.name ASC`,
  );
  return { people: result.rows };
});

app.post('/api/people', { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120),
  }).parse(request.body);
  const personId = randomUUID();
  const credentialKeyHex = newCredential().toString('hex');
  await pool.query(
    'INSERT INTO people(person_id, name, credential_ciphertext) VALUES($1, $2, $3)',
    [personId, body.name, encryptCredentialHex(credentialKeyHex, masterKey)],
  );
  broadcast('people_changed', { personId });
  return reply.code(201).send({ personId, name: body.name, credentialKeyHex });
});

type GrantInput = {
  personId?: string;
  name?: string;
  deviceId: string;
  schedule: z.infer<typeof scheduleSchema>;
};

async function upsertGrant(input: GrantInput): Promise<{
  grantId: string;
  personId: string;
  name: string;
  credentialKeyHex: string;
  deviceId: string;
  schedule: z.infer<typeof scheduleSchema>;
}> {
  const deviceId = deviceIdSchema.parse(input.deviceId);
  const exists = await pool.query('SELECT 1 FROM devices WHERE device_id = $1', [deviceId]);
  if (exists.rowCount === 0) throw Object.assign(new Error('Smart lock not registered'), { statusCode: 404 });

  let personId = input.personId;
  let personName = input.name?.trim() ?? '';
  let credentialKeyHex = '';

  if (personId) {
    const person = await pool.query<{
      name: string;
      credential_ciphertext: string;
    }>(
      'SELECT name, credential_ciphertext FROM people WHERE person_id = $1',
      [z.string().uuid().parse(personId)],
    );
    const row = person.rows[0];
    if (!row) throw Object.assign(new Error('Person not found'), { statusCode: 404 });
    personName = row.name;
    credentialKeyHex = decryptCredentialHex(row.credential_ciphertext, masterKey);
  } else {
    personName = z.string().trim().min(1).max(120).parse(personName);
    personId = randomUUID();
    credentialKeyHex = newCredential().toString('hex');
    await pool.query(
      'INSERT INTO people(person_id, name, credential_ciphertext) VALUES($1, $2, $3)',
      [personId, personName, encryptCredentialHex(credentialKeyHex, masterKey)],
    );
  }

  const schedule = scheduleSchema.parse(input.schedule);
  const proposedGrantId = randomUUID();
  const result = await pool.query<{ grantId: string }>(
    `INSERT INTO access_grants(
       grant_id, person_id, device_id, access_type, days_mask,
       start_minute, end_minute, valid_from, valid_until
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (person_id, device_id)
     DO UPDATE SET
       access_type = excluded.access_type,
       days_mask = excluded.days_mask,
       start_minute = excluded.start_minute,
       end_minute = excluded.end_minute,
       valid_from = excluded.valid_from,
       valid_until = excluded.valid_until,
       revoked_at = NULL,
       created_at = now()
     RETURNING grant_id AS "grantId"`,
    [
      proposedGrantId,
      personId,
      deviceId,
      schedule.accessType,
      schedule.daysMask,
      schedule.startMinute,
      schedule.endMinute,
      schedule.validFrom,
      schedule.validUntil,
    ],
  );

  return {
    grantId: result.rows[0]!.grantId,
    personId,
    name: personName,
    credentialKeyHex,
    deviceId,
    schedule,
  };
}

app.get('/api/access-grants', { preHandler: requireAdmin }, async (request) => {
  const query = z.object({
    deviceId: deviceIdSchema.optional(),
    personId: z.string().uuid().optional(),
  }).parse(request.query);

  const values: unknown[] = [];
  const clauses = ['g.revoked_at IS NULL'];
  if (query.deviceId) {
    values.push(query.deviceId);
    clauses.push(`g.device_id = $${values.length}`);
  }
  if (query.personId) {
    values.push(query.personId);
    clauses.push(`g.person_id = $${values.length}`);
  }

  const result = await pool.query(
    `SELECT
       g.grant_id AS "grantId",
       g.person_id AS "personId",
       p.name AS "personName",
       g.device_id AS "deviceId",
       d.name AS "deviceName",
       d.location,
       g.access_type AS "accessType",
       g.days_mask AS "daysMask",
       g.start_minute AS "startMinute",
       g.end_minute AS "endMinute",
       g.valid_from AS "validFrom",
       g.valid_until AS "validUntil",
       g.created_at AS "createdAt"
     FROM access_grants g
     JOIN people p ON p.person_id = g.person_id
     JOIN devices d ON d.device_id = g.device_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.name ASC, d.name ASC`,
    values,
  );
  return {
    grants: result.rows.map((row) => ({
      ...row,
      daysMask: Number(row.daysMask),
      startMinute: Number(row.startMinute),
      endMinute: Number(row.endMinute),
      validFrom: Number(row.validFrom),
      validUntil: row.validUntil === null ? null : Number(row.validUntil),
    })),
  };
});

app.post('/api/access-grants', { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({
    personId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    deviceId: deviceIdSchema,
    schedule: scheduleSchema,
  }).refine((value) => Boolean(value.personId || value.name), {
    message: 'Select a person or provide a name',
  }).parse(request.body);

  const grant = await upsertGrant(body);
  broadcast('access_changed', { deviceId: grant.deviceId, personId: grant.personId });
  return reply.code(201).send(grant);
});

app.delete<{ Params: { grantId: string } }>(
  '/api/access-grants/:grantId',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const grantId = z.string().uuid().parse(request.params.grantId);
    const result = await pool.query<{ deviceId: string; personId: string }>(
      `UPDATE access_grants
       SET revoked_at = now()
       WHERE grant_id = $1 AND revoked_at IS NULL
       RETURNING device_id AS "deviceId", person_id AS "personId"`,
      [grantId],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'Active access grant not found' });
    broadcast('access_changed', row);
    return reply.code(204).send();
  },
);

// Legacy mobile-app routes. They now write/read the normalized people + grants model.
app.post<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/users',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(1).max(120),
      schedule: scheduleSchema,
    }).parse(request.body);
    const grant = await upsertGrant({
      name: body.name,
      deviceId: request.params.deviceId,
      schedule: body.schedule,
    });
    broadcast('access_changed', { deviceId: grant.deviceId, personId: grant.personId });
    return reply.code(201).send({
      userId: grant.personId,
      credentialKeyHex: grant.credentialKeyHex,
      schedule: grant.schedule,
    });
  },
);

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/users',
  { preHandler: requireAdmin },
  async (request) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const result = await pool.query(
      `SELECT
       g.person_id AS "userId",
       p.name,
       g.access_type AS "accessType",
       g.days_mask AS "daysMask",
       g.start_minute AS "startMinute",
       g.end_minute AS "endMinute",
       g.valid_from AS "validFrom",
       g.valid_until AS "validUntil"
       FROM access_grants g
       JOIN people p ON p.person_id = g.person_id
       WHERE g.device_id = $1 AND g.revoked_at IS NULL
       ORDER BY p.name ASC`,
      [deviceId],
    );
    return {
      users: result.rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        schedule: {
          accessType: row.accessType,
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
    const personId = z.string().uuid().parse(request.params.userId);
    const result = await pool.query(
      `UPDATE access_grants
       SET revoked_at = now()
       WHERE device_id = $1 AND person_id = $2 AND revoked_at IS NULL`,
      [deviceId, personId],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Active access grant not found' });
    }
    broadcast('access_changed', { deviceId, personId });
    return reply.code(204).send();
  },
);

app.get('/api/events', { preHandler: requireAdmin }, async (request) => {
  const query = z.object({
    deviceId: deviceIdSchema.optional(),
  }).parse(request.query);

  const values: unknown[] = [];
  let where = '';
  if (query.deviceId) {
    values.push(query.deviceId);
    where = 'WHERE e.device_id = $1';
  }

  const result = await pool.query(
    `SELECT
       e.event_id AS "eventId",
       e.device_id AS "deviceId",
       d.name AS "deviceName",
       d.location,
       e.occurred_at AS "occurredAt",
       e.event_type AS type,
       e.user_id AS "userId",
       p.name AS "userName",
       e.detail
     FROM access_events e
     JOIN devices d ON d.device_id = e.device_id
     LEFT JOIN people p ON p.person_id = e.user_id
     ${where}
     ORDER BY e.occurred_at DESC
     LIMIT 200`,
    values,
  );
  return { events: result.rows };
});

app.get<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/events',
  { preHandler: requireAdmin },
  async (request) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const result = await pool.query(
      `SELECT
       e.event_id AS "eventId",
       e.occurred_at AS "occurredAt",
       e.event_type AS type,
       e.user_id AS "userId",
       p.name AS "userName",
       e.detail
       FROM access_events e
       LEFT JOIN people p ON p.person_id = e.user_id
       WHERE e.device_id = $1
       ORDER BY e.occurred_at DESC
       LIMIT 200`,
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
      `SELECT
       g.person_id AS "userId",
       p.credential_ciphertext AS ciphertext,
       g.days_mask AS "daysMask",
       g.start_minute AS "startMinute",
       g.end_minute AS "endMinute",
       g.valid_from AS "validFrom",
       g.valid_until AS "validUntil"
       FROM access_grants g
       JOIN people p ON p.person_id = g.person_id
       WHERE g.device_id = $1
         AND g.revoked_at IS NULL
         AND (g.valid_until IS NULL OR g.valid_until > floor(extract(epoch from now())))
       ORDER BY g.created_at`,
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
  type: z.enum(['granted', 'denied', 'enrolled']),
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
          `INSERT INTO access_events(
             event_id, device_id, occurred_at, event_type, user_id, detail
           ) VALUES($1, $2, $3, $4, $5, $6)
           ON CONFLICT(event_id) DO NOTHING`,
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

    broadcast('events_changed', { deviceId, count: body.events.length });
    return reply.code(202).send({ accepted: body.events.length });
  },
);

app.addHook('onClose', async () => {
  for (const socket of adminSockets) socket.close();
  await closeDatabase();
});

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
