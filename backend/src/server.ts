import { randomUUID } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
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
  newMobileToken,
  tokenHash,
} from './crypto.js';
import { auth } from './auth.js';
import { closeDatabase, initializeDatabase, pool } from './database.js';

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });
const masterKey = process.env.CREDENTIAL_MASTER_KEY ?? '';
const port = Number(process.env.PORT ?? '8080');

const deviceIdSchema = z.string().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/);
const fullNameSchema = z.string().trim().min(2).max(120);
const studentNumberSchema = z.string().trim().min(4).max(32);

function normalizeStudentNumber(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9._-]{4,32}$/.test(normalized)) {
    throw Object.assign(new Error('Enter a valid student/computer number'), { statusCode: 400 });
  }
  return normalized;
}
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
const deviceSockets = new Map<string, Set<AdminSocket>>();
type PairingResult = { accepted: boolean; error?: string };
const pendingPairing = new Map<string, {
  deviceId: string;
  socket: AdminSocket;
  finish: (result: PairingResult) => void;
}>();

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

async function deviceTokenValid(deviceId: string, supplied: string): Promise<boolean> {
  const result = await pool.query<{ token_hash: string }>(
    'SELECT token_hash FROM devices WHERE device_id = $1',
    [deviceId],
  );
  const row = result.rows[0];
  return Boolean(row && supplied && constantTimeHexEqual(tokenHash(supplied), row.token_hash));
}

async function markDeviceSeen(deviceId: string): Promise<void> {
  await pool.query(
    'UPDATE devices SET last_seen_at = now() WHERE device_id = $1',
    [deviceId],
  );
  broadcast('device_seen', { deviceId });
}

async function controllerSyncPayload(deviceId: string) {
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
    type: 'sync',
    serverUnixSeconds: Math.floor(Date.now() / 1000),
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
}

async function pushControllerSync(deviceId: string): Promise<void> {
  const sockets = deviceSockets.get(deviceId);
  if (!sockets || sockets.size === 0) return;
  const message = JSON.stringify(await controllerSyncPayload(deviceId));
  for (const socket of [...sockets]) {
    if (socket.readyState === 1) {
      socket.send(message);
    } else {
      sockets.delete(socket);
    }
  }
  if (sockets.size === 0) deviceSockets.delete(deviceId);
}

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

type DashboardRole = 'owner' | 'admin' | 'user';

async function dashboardSession(request: FastifyRequest) {
  return auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await dashboardSession(request);
  const role = (session?.user as { role?: DashboardRole } | undefined)?.role;
  if (!session) {
    await reply.code(401).send({ error: 'Sign in required' });
    return;
  }
  if (role !== 'owner' && role !== 'admin') {
    await reply.code(403).send({ error: 'Administrator access required' });
  }
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await dashboardSession(request);
  const role = (session?.user as { role?: DashboardRole } | undefined)?.role;
  if (!session) {
    await reply.code(401).send({ error: 'Sign in required' });
    return;
  }
  if (role !== 'owner') {
    await reply.code(403).send({ error: 'Only the owner can add administrators' });
  }
}

async function requireDevice(
  request: FastifyRequest<{ Params: { deviceId: string } }>,
  reply: FastifyReply,
): Promise<boolean> {
  const supplied = bearer(request);
  if (!(await deviceTokenValid(request.params.deviceId, supplied))) {
    await reply.code(401).send({ error: 'Device authentication failed' });
    return false;
  }
  await markDeviceSeen(request.params.deviceId);
  return true;
}

async function requireMobile(request: FastifyRequest, reply: FastifyReply): Promise<{
  personId: string;
  name: string;
  studentNumber: string | null;
  credentialCiphertext: string;
} | null> {
  const supplied = bearer(request);
  if (!supplied) {
    await reply.code(401).send({ error: 'Student registration required' });
    return null;
  }

  const result = await pool.query<{
    personId: string;
    name: string;
    studentNumber: string | null;
    credentialCiphertext: string;
  }>(
    `SELECT
       p.person_id AS "personId",
       p.name,
       p.student_number AS "studentNumber",
       p.credential_ciphertext AS "credentialCiphertext"
     FROM mobile_sessions s
     JOIN people p ON p.person_id = s.person_id
     WHERE s.token_hash = $1`,
    [tokenHash(supplied)],
  );
  const row = result.rows[0];
  if (!row) {
    await reply.code(401).send({ error: 'Student registration is no longer valid' });
    return null;
  }

  await pool.query(
    'UPDATE mobile_sessions SET last_seen_at = now() WHERE token_hash = $1',
    [tokenHash(supplied)],
  );
  return row;
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
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'accept'],
  credentials: true,
  maxAge: 86400,
});

app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  async handler(request, reply) {
    try {
      const base = process.env.BETTER_AUTH_URL ?? `http://${request.headers.host}`;
      const url = new URL(request.url, base);
      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const response = await auth.handler(authRequest);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    } catch (error) {
      app.log.error(error, 'Better Auth request failed');
      return reply.code(500).send({ error: 'Authentication request failed' });
    }
  },
});

await app.register(websocket);

app.get('/ws/admin', { websocket: true }, (rawSocket, request) => {
  const socket = rawSocket as unknown as AdminSocket;

  const cleanup = () => {
    adminSockets.delete(socket);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  void (async () => {
    const session = await dashboardSession(request);
    const role = (session?.user as { role?: DashboardRole } | undefined)?.role;
    if (!session || (role !== 'owner' && role !== 'admin')) {
      socket.send(JSON.stringify({ type: 'auth_error' }));
      socket.close();
      return;
    }

    adminSockets.add(socket);
    socket.send(JSON.stringify({ type: 'ready' }));
  })().catch(() => socket.close());
});

app.get<{ Params: { deviceId: string } }>(
  '/ws/device/:deviceId',
  { websocket: true },
  (rawSocket, request) => {
    const socket = rawSocket as unknown as AdminSocket;
    const deviceId = request.params.deviceId;
    let authenticated = false;
    app.log.info({ deviceId }, 'Controller WebSocket transport connected');

    const cleanup = () => {
      for (const pending of pendingPairing.values()) {
        if (pending.socket === socket) {
          pending.finish({ accepted: false, error: 'Controller disconnected. Try again when it is online.' });
        }
      }
      const sockets = deviceSockets.get(deviceId);
      sockets?.delete(socket);
      if (sockets?.size === 0) deviceSockets.delete(deviceId);
      app.log.info({ deviceId, authenticated }, 'Controller WebSocket disconnected');
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.on('message', (rawPayload) => {
      void (async () => {
        const payload = typeof rawPayload === 'string'
          ? rawPayload
          : rawPayload.toString('utf8');

        let message: unknown;
        try {
          message = JSON.parse(payload);
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
          return;
        }

        if (!authenticated) {
          const authMessage = z.object({
            type: z.literal('auth'),
            token: z.string().min(16).max(256),
          }).safeParse(message);
          if (!authMessage.success ||
              !(await deviceTokenValid(deviceId, authMessage.data.token))) {
            socket.send(JSON.stringify({ type: 'auth_error' }));
            socket.close();
            return;
          }

          deviceIdSchema.parse(deviceId);
          authenticated = true;
          const sockets = deviceSockets.get(deviceId) ?? new Set<AdminSocket>();
          sockets.add(socket);
          deviceSockets.set(deviceId, sockets);
          await markDeviceSeen(deviceId);
          app.log.info({ deviceId }, 'Controller WebSocket authenticated');
          socket.send(JSON.stringify(await controllerSyncPayload(deviceId)));
          return;
        }

        const messageType = z.object({ type: z.string() }).safeParse(message);
        if (!messageType.success) return;

        if (messageType.data.type === 'pairing_ack') {
          const ack = z.object({
            requestId: z.string().uuid(),
            accepted: z.boolean(),
            error: z.enum(['Pairing temporarily locked', 'Invalid pairing PIN configuration']).optional(),
          }).safeParse(message);
          if (ack.success) {
            const pending = pendingPairing.get(ack.data.requestId);
            if (pending?.deviceId === deviceId && pending.socket === socket) {
              pending.finish({ accepted: ack.data.accepted, error: ack.data.error });
            }
          }
        } else if (messageType.data.type === 'heartbeat') {
          await markDeviceSeen(deviceId);
          socket.send(JSON.stringify({
            type: 'heartbeat_ack',
            serverUnixSeconds: Math.floor(Date.now() / 1000),
          }));
        } else if (messageType.data.type === 'sync_request') {
          await markDeviceSeen(deviceId);
          socket.send(JSON.stringify(await controllerSyncPayload(deviceId)));
        }
      })().catch((error) => {
        app.log.error(error, `Device WebSocket failed for ${deviceId}`);
        socket.close();
      });
    });
  },
);

app.get('/', async () => ({
  service: 'Smart Lock Access API',
  version: '0.4.0',
  health: '/health',
  controllerWebSocket: '/ws/device/:deviceId',
}));
app.get('/health', async () => ({
  ok: true,
  version: '0.4.0',
  controllerWebSocket: true,
}));

app.post('/api/mobile/register', async (request, reply) => {
  const body = z.object({
    fullName: fullNameSchema,
    studentNumber: studentNumberSchema,
    installationId: z.string().uuid(),
    deviceLabel: z.string().trim().max(120).default('Android phone'),
  }).parse(request.body);

  const studentNumber = normalizeStudentNumber(body.studentNumber);
  const mobileToken = newMobileToken();
  const mobileTokenHash = tokenHash(mobileToken);

  const existingInstallation = await pool.query<{
    personId: string;
    name: string;
    studentNumber: string | null;
  }>(
    `SELECT
       p.person_id AS "personId",
       p.name,
       p.student_number AS "studentNumber"
     FROM mobile_sessions s
     JOIN people p ON p.person_id = s.person_id
     WHERE s.installation_id = $1`,
    [body.installationId],
  );

  if (existingInstallation.rows[0]) {
    const existing = existingInstallation.rows[0];
    if (existing.studentNumber !== studentNumber) {
      return reply.code(409).send({
        error: 'This phone is already registered to a different student number',
      });
    }
    await pool.query(
      `UPDATE mobile_sessions
       SET token_hash = $1, device_label = $2, last_seen_at = now()
       WHERE installation_id = $3`,
      [mobileTokenHash, body.deviceLabel, body.installationId],
    );
    await pool.query(
      'UPDATE people SET name = $1 WHERE person_id = $2',
      [body.fullName, existing.personId],
    );
    broadcast('people_changed', { personId: existing.personId });
    return reply.send({
      mobileToken,
      person: {
        personId: existing.personId,
        fullName: body.fullName,
        studentNumber,
      },
    });
  }

  const existingStudent = await pool.query<{ personId: string }>(
    'SELECT person_id AS "personId" FROM people WHERE student_number = $1',
    [studentNumber],
  );
  if (existingStudent.rows[0]) {
    return reply.code(409).send({
      error: 'This student number is already registered. Ask an administrator to help re-register the phone.',
    });
  }

  const personId = randomUUID();
  const credentialKeyHex = newCredential().toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO people(person_id, name, student_number, credential_ciphertext)
       VALUES($1, $2, $3, $4)`,
      [
        personId,
        body.fullName,
        studentNumber,
        encryptCredentialHex(credentialKeyHex, masterKey),
      ],
    );
    await client.query(
      `INSERT INTO mobile_sessions(
         session_id, person_id, installation_id, device_label, token_hash
       ) VALUES($1, $2, $3, $4, $5)`,
      [randomUUID(), personId, body.installationId, body.deviceLabel, mobileTokenHash],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  broadcast('people_changed', { personId });
  return reply.code(201).send({
    mobileToken,
    person: {
      personId,
      fullName: body.fullName,
      studentNumber,
    },
  });
});

app.get('/api/mobile/access', async (request, reply) => {
  const mobile = await requireMobile(request, reply);
  if (!mobile) return;

  const grants = await pool.query(
    `SELECT
       g.grant_id AS "grantId",
       g.device_id AS "deviceId",
       d.name AS "deviceName",
       d.location,
       g.access_type AS "accessType",
       g.days_mask AS "daysMask",
       g.start_minute AS "startMinute",
       g.end_minute AS "endMinute",
       g.valid_from AS "validFrom",
       g.valid_until AS "validUntil"
     FROM access_grants g
     JOIN devices d ON d.device_id = g.device_id
     WHERE g.person_id = $1
       AND g.revoked_at IS NULL
       AND (g.valid_until IS NULL OR g.valid_until > floor(extract(epoch from now())))
     ORDER BY d.name ASC`,
    [mobile.personId],
  );

  return {
    person: {
      personId: mobile.personId,
      fullName: mobile.name,
      studentNumber: mobile.studentNumber,
    },
    credentialKeyHex: decryptCredentialHex(mobile.credentialCiphertext, masterKey),
    serverUnixSeconds: Math.floor(Date.now() / 1000),
    grants: grants.rows.map((row) => ({
      ...row,
      daysMask: Number(row.daysMask),
      startMinute: Number(row.startMinute),
      endMinute: Number(row.endMinute),
      validFrom: Number(row.validFrom),
      validUntil: row.validUntil === null ? null : Number(row.validUntil),
    })),
  };
});

app.get('/api/admins', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(
    `SELECT
       id,
       name,
       email,
       role,
       "createdAt"
     FROM "user"
     WHERE role IN ('owner', 'admin')
     ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, "createdAt" ASC`,
  );
  return { admins: result.rows };
});

app.post('/api/admins', { preHandler: requireOwner }, async (request, reply) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  }).parse(request.body);

  const created = await auth.api.createUser({
    body: {
      name: body.name,
      email: body.email.toLowerCase(),
      password: body.password,
      role: 'admin',
    },
  });

  return reply.code(201).send({ admin: created.user });
});

app.get('/api/devices', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(
    `SELECT
       device_id AS "deviceId",
       name,
       location,
       created_at AS "createdAt",
       last_seen_at AS "lastSeenAt",
       (last_seen_at IS NOT NULL AND last_seen_at > now() - interval '150 seconds') AS online
     FROM devices
     ORDER BY created_at DESC`,
  );
  return { devices: result.rows };
});

app.post<{ Params: { deviceId: string } }>(
  '/api/devices/:deviceId/pairing',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const deviceId = deviceIdSchema.parse(request.params.deviceId);
    const device = await pool.query('SELECT 1 FROM devices WHERE device_id = $1', [deviceId]);
    if (!device.rowCount) return reply.code(404).send({ error: 'Smart lock not found' });
    const socket = [...(deviceSockets.get(deviceId) ?? [])].find((candidate) => candidate.readyState === 1);
    if (!socket) return reply.code(409).send({ error: 'Controller is offline. Connect it to Wi-Fi first.' });
    if ([...pendingPairing.values()].some((pending) => pending.deviceId === deviceId)) {
      return reply.code(409).send({ error: 'A pairing request is already in progress for this lock.' });
    }

    const requestId = randomUUID();
    const result = await new Promise<PairingResult>((resolve) => {
      const finish = (value: PairingResult) => {
        clearTimeout(timer);
        pendingPairing.delete(requestId);
        resolve(value);
      };
      const timer = setTimeout(() => finish({
        accepted: false,
        error: 'Controller did not confirm pairing. Check its connection and install the latest firmware.',
      }), 5000);
      pendingPairing.set(requestId, { deviceId, socket, finish });
      try {
        socket.send(JSON.stringify({ type: 'enable_pairing', requestId }));
      } catch {
        finish({ accepted: false, error: 'Controller disconnected. Try again when it is online.' });
      }
    });
    if (!result.accepted) return reply.code(409).send({ error: result.error ?? 'Controller could not enable pairing' });
    app.log.info({ deviceId }, 'Administrator enabled controller pairing');
    return { deviceId, expiresInSeconds: 120 };
  },
);

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
       p.student_number AS "studentNumber",
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
    name: fullNameSchema,
    studentNumber: studentNumberSchema.optional(),
  }).parse(request.body);
  const personId = randomUUID();
  const credentialKeyHex = newCredential().toString('hex');
  await pool.query(
    'INSERT INTO people(person_id, name, student_number, credential_ciphertext) VALUES($1, $2, $3, $4)',
    [
      personId,
      body.name,
      body.studentNumber ? normalizeStudentNumber(body.studentNumber) : null,
      encryptCredentialHex(credentialKeyHex, masterKey),
    ],
  );
  broadcast('people_changed', { personId });
  return reply.code(201).send({ personId, name: body.name, credentialKeyHex });
});

app.patch<{ Params: { personId: string } }>(
  '/api/people/:personId',
  { preHandler: requireAdmin },
  async (request, reply) => {
    const personId = z.string().uuid().parse(request.params.personId);
    const body = z.object({
      name: fullNameSchema,
      studentNumber: z.union([studentNumberSchema, z.literal(''), z.null()]),
    }).strict().parse(request.body);
    const studentNumber = body.studentNumber ? normalizeStudentNumber(body.studentNumber) : null;
    try {
      const result = await pool.query(
        `UPDATE people SET name = $2, student_number = $3
         WHERE person_id = $1
         RETURNING person_id AS "personId", name, student_number AS "studentNumber"`,
        [personId, body.name, studentNumber],
      );
      if (!result.rowCount) return reply.code(404).send({ error: 'Person not found' });
      broadcast('people_changed', { personId });
      return { person: result.rows[0] };
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === '23505' &&
          (error as { constraint?: string }).constraint === 'people_student_number_unique') {
        return reply.code(409).send({ error: 'This student number is already assigned to another person.' });
      }
      throw error;
    }
  },
);

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
    personId: z.string().uuid(),
    deviceId: deviceIdSchema,
    schedule: scheduleSchema,
  }).parse(request.body);

  const grant = await upsertGrant(body);
  broadcast('access_changed', { deviceId: grant.deviceId, personId: grant.personId });
  void pushControllerSync(grant.deviceId).catch((error) => app.log.error(error, 'Controller sync push failed'));
  return reply.code(201).send({
    grantId: grant.grantId,
    personId: grant.personId,
    name: grant.name,
    deviceId: grant.deviceId,
    schedule: grant.schedule,
  });
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
    void pushControllerSync(row.deviceId).catch((error) => app.log.error(error, 'Controller sync push failed'));
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
  void pushControllerSync(grant.deviceId).catch((error) => app.log.error(error, 'Controller sync push failed'));
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
      serverUnixSeconds: Math.floor(Date.now() / 1000),
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
    void pushControllerSync(deviceId).catch((error) => app.log.error(error, 'Controller sync push failed'));
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
    const payload = await controllerSyncPayload(deviceId);
    return {
      serverUnixSeconds: payload.serverUnixSeconds,
      users: payload.users,
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
  for (const pending of pendingPairing.values()) {
    pending.finish({ accepted: false, error: 'API is restarting. Try again shortly.' });
  }
  for (const socket of adminSockets) socket.close();
  for (const sockets of deviceSockets.values()) {
    for (const socket of sockets) socket.close();
  }
  deviceSockets.clear();
  await closeDatabase();
});

async function initializeBetterAuth(): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();

  const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM "user"');
  if (Number(result.rows[0]?.count ?? '0') > 0) return;

  const email = process.env.BETTER_AUTH_OWNER_EMAIL?.trim();
  const password = process.env.BETTER_AUTH_OWNER_PASSWORD;
  const name = process.env.BETTER_AUTH_OWNER_NAME?.trim() || 'Owner';

  if (!email || !password) {
    throw new Error(
      'Set BETTER_AUTH_OWNER_EMAIL and BETTER_AUTH_OWNER_PASSWORD for the first dashboard owner',
    );
  }

  await auth.api.createUser({
    body: {
      email: email.toLowerCase(),
      password,
      name,
      role: 'owner',
    },
  });
  app.log.info({ email }, 'Created initial Smart Access owner');
}

async function start(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL before starting the backend');
  }
  if (!/^[0-9a-f]{64}$/i.test(masterKey)) {
    throw new Error('Set CREDENTIAL_MASTER_KEY to 64 hex characters');
  }
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('Set BETTER_AUTH_SECRET to at least 32 characters');
  }
  await initializeDatabase();
  await initializeBetterAuth();
  await app.listen({ host: '0.0.0.0', port });
}

start().catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});

process.on('SIGINT', () => void app.close());
process.on('SIGTERM', () => void app.close());
