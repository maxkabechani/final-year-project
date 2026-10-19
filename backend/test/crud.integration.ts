import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { initializeDatabase } from '../src/database.js';

// This suite writes fixtures and must only run against an isolated local test DB.
const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:8080';
const database = new URL(process.env.DATABASE_URL ?? 'postgres://localhost/missing');
if (!database.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('CRUD integration tests require a local API and a database name ending in _test.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test('management CRUD, authorization, controller revocation, and owner safeguards', async () => {
  let cookie = '';
  const stamp = Date.now();
  const deviceId = `crud-${stamp}`;
  const ids: string[] = [];
  const adminIds: string[] = [];
  const sockets: WebSocket[] = [];
  let ownerId = '';
  const request = (path: string, method = 'GET', body?: unknown, session = cookie) => fetch(base + path, {
    method, headers: { origin: 'http://localhost:3000', ...(session ? { cookie: session } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const login = async (email: string, password: string) => {
    const response = await request('/api/auth/sign-in/email', 'POST', { email, password }, '');
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  };
  const schedule = { accessType: 'recurring', daysMask: 127, startMinute: 0, endMinute: 1440, validFrom: 0, validUntil: null };
  try {
    cookie = await login(process.env.BETTER_AUTH_OWNER_EMAIL!, process.env.BETTER_AUTH_OWNER_PASSWORD!);
    const admins = await (await request('/api/admins')).json() as { admins: Array<{ id: string; role: string }> };
    ownerId = admins.admins.find(admin => admin.role === 'owner')!.id;
    assert.equal(admins.admins.filter(admin => admin.role === 'owner').length, 1, 'Use a fresh test database');
    assert.equal((await request(`/api/admins/${ownerId}`, 'DELETE')).status, 409);
    assert.equal((await request(`/api/admins/${ownerId}`, 'PATCH', { name: 'Owner', email: process.env.BETTER_AUTH_OWNER_EMAIL, role: 'admin' })).status, 409);
    assert.equal((await request('/api/auth/admin/remove-user', 'POST', { userId: ownerId })).status, 403);

    const adminEmail = `crud-${stamp}@example.com`;
    const password = `Test-only-${randomUUID()}`;
    const createdAdmin = await request('/api/admins', 'POST', { name: 'CRUD Admin', email: adminEmail, password });
    assert.equal(createdAdmin.status, 201);
    const adminId = ((await createdAdmin.json()) as { admin: { id: string } }).admin.id;
    adminIds.push(adminId);
    let adminCookie = await login(adminEmail, password);
    assert.equal((await request(`/api/admins/${adminId}`, 'DELETE', undefined, adminCookie)).status, 403);
    assert.equal((await request(`/api/admins/${adminId}`, 'PATCH', { name: 'Updated Admin', email: adminEmail, role: 'owner' }, adminCookie)).status, 403);
    assert.equal((await request(`/api/admins/${adminId}`, 'PATCH', { name: 'Updated Admin', email: adminEmail, role: 'owner' })).status, 204);
    assert.equal((await request('/api/devices', 'GET', undefined, adminCookie)).status, 401, 'Role changes invalidate sessions');
    adminCookie = await login(adminEmail, password);
    const demotions = await Promise.all([
      request(`/api/admins/${ownerId}`, 'PATCH', { name: 'Owner', email: process.env.BETTER_AUTH_OWNER_EMAIL, role: 'admin' }),
      request(`/api/admins/${adminId}`, 'PATCH', { name: 'Updated Admin', email: adminEmail, role: 'admin' }, adminCookie),
    ]);
    assert.deepEqual(demotions.map(response => response.status).sort(), [204, 409]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM "user" WHERE role=\'owner\'')).rows[0].count, 1);
    // Restore only this disposable test DB's bootstrap owner for the remaining checks.
    await pool.query('UPDATE "user" SET role=\'owner\' WHERE id=$1', [ownerId]);
    cookie = await login(process.env.BETTER_AUTH_OWNER_EMAIL!, process.env.BETTER_AUTH_OWNER_PASSWORD!);
    assert.equal((await request(`/api/admins/${adminId}`, 'DELETE')).status, 204);
    assert.equal((await request('/api/devices', 'GET', undefined, adminCookie)).status, 401);

    const mobile = await request('/api/mobile/register', 'POST', { fullName: 'CRUD Student', studentNumber: `CRUD-${stamp}`, installationId: randomUUID() }, '');
    assert.equal(mobile.status, 201);
    const registration = await mobile.json() as { person: { personId: string }; mobileToken: string };
    const personId = registration.person.personId;
    ids.push(personId);
    const device = await request('/api/devices', 'POST', { deviceId, name: 'CRUD Door', location: 'Test room' });
    assert.equal(device.status, 201);
    const token = ((await device.json()) as { deviceToken: string }).deviceToken;
    assert.equal((await request(`/api/devices/${deviceId}`, 'PATCH', { name: 'Updated Door', location: 'Updated room' }, '')).status, 401);
    assert.equal((await request(`/api/devices/${deviceId}`, 'PATCH', { name: 'Updated Door', location: 'Updated room' })).status, 204);
    assert.equal((await request(`/api/people/${personId}`, 'PATCH', { name: 'Updated Student', studentNumber: `UPDATED-${stamp}` })).status, 200);
    const grant = await request('/api/access-grants', 'POST', { personId, deviceId, schedule });
    assert.equal(grant.status, 201);
    const grantId = ((await grant.json()) as { grantId: string }).grantId;
    assert.equal((await request(`/api/access-grants/${grantId}`, 'PATCH', { schedule: { ...schedule, startMinute: 10, endMinute: 20 } })).status, 204);
    assert.equal((await request(`/api/access-grants/${grantId}`, 'PATCH', { schedule: { ...schedule, startMinute: 30, endMinute: 20 } })).status, 400);
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/device/${deviceId}`);
    sockets.push(ws);
    const messages: Array<{ type: string; users: unknown[] }> = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Controller authentication timed out')), 3000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
      ws.onmessage = event => { const message = JSON.parse(String(event.data)); messages.push(message); if (message.type === 'sync') { clearTimeout(timer); resolve(); } };
      ws.onerror = reject;
    });
    assert.equal(messages.at(-1)!.users.length, 1);
    assert.equal((messages.at(-1)!.users[0] as { name: string }).name, 'Updated Student', 'Controller receives the registered person name');

    // Queue several frames before the auth DB lookup completes. They must be
    // handled in order, and event retries must never create duplicate rows.
    const eventId = randomUUID();
    const batchId = randomUUID();
    const batch = { type: 'events', requestId: batchId, events: [{
      eventId, occurredAt: new Date().toISOString(), type: 'denied',
      userId: null, detail: 'WebSocket reconnect regression',
    }] };
    const burst = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/device/${deviceId}`);
    sockets.push(burst);
    const received: Array<Record<string, unknown>> = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Auth/heartbeat/event burst timed out')), 5000);
      burst.onopen = () => {
        burst.send(JSON.stringify({ type: 'auth', token }));
        burst.send(JSON.stringify({ type: 'heartbeat' }));
        burst.send(JSON.stringify(batch));
      };
      burst.onmessage = event => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        received.push(message);
        if (message.type === 'events_ack') { clearTimeout(timer); resolve(); }
        if (message.type === 'auth_error') { clearTimeout(timer); reject(new Error('Frames raced authentication')); }
      };
      burst.onerror = error => { clearTimeout(timer); reject(error); };
    });
    assert.deepEqual(received.map(message => message.type), ['sync', 'heartbeat_ack', 'events_ack']);
    assert.deepEqual(received.at(-1)!.eventIds, [eventId]);
    assert.equal(received.at(-1)!.requestId, batchId);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM access_events WHERE event_id=$1', [eventId])).rows[0].count, 1, 'ACK follows database commit');

    const waitForControllerMessage = (socket: WebSocket, type: string, requestId?: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error(`Timed out waiting for ${type}`)); }, 5000);
      const listener = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.type !== type || (requestId && message.requestId !== requestId)) return;
        clearTimeout(timer);
        socket.removeEventListener('message', listener);
        resolve(message);
      };
      socket.addEventListener('message', listener);
    });
    const reconnected = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/device/${deviceId}`);
    sockets.push(reconnected);
    const reconnectSync = waitForControllerMessage(reconnected, 'sync');
    reconnected.onopen = () => reconnected.send(JSON.stringify({ type: 'auth', token }));
    assert.equal(((await reconnectSync).users as unknown[]).length, 1, 'Reconnect restores a full grant/time sync');
    burst.close();

    const renamedSync = waitForControllerMessage(reconnected, 'sync');
    assert.equal((await request(`/api/people/${personId}`, 'PATCH', {
      name: 'José Updated Student', studentNumber: `UPDATED-${stamp}`,
    })).status, 200);
    const renamed = (await renamedSync).users as Array<{ name: string }>;
    assert.equal(renamed[0]!.name, 'Jose Updated Student', 'Renaming a person pushes fresh LCD metadata');
    const httpSync = await fetch(`${base}/api/devices/${deviceId}/sync`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(httpSync.status, 200);
    assert.equal(((await httpSync.json()) as { users: Array<{ name: string }> }).users[0]!.name, 'Jose Updated Student');

    const retriedAck = waitForControllerMessage(reconnected, 'events_ack', batchId);
    reconnected.send(JSON.stringify(batch));
    assert.deepEqual((await retriedAck).eventIds, [eventId]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM access_events WHERE event_id=$1', [eventId])).rows[0].count, 1, 'Retry after a lost ACK is idempotent');

    const rejected = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/device/${deviceId}`);
    sockets.push(rejected);
    const authError = waitForControllerMessage(rejected, 'auth_error');
    const unauthorizedEventId = randomUUID();
    rejected.onopen = () => {
      rejected.send(JSON.stringify({ type: 'auth', token: 'invalid-controller-token' }));
      rejected.send(JSON.stringify({ ...batch, events: [{ ...batch.events[0], eventId: unauthorizedEventId }] }));
    };
    await authError;
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM access_events WHERE event_id=$1', [unauthorizedEventId])).rows[0].count, 0, 'Unauthenticated events cannot reach storage');

    assert.equal((await request(`/api/access-grants/${grantId}`, 'DELETE')).status, 204);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(messages.at(-1)!.users.length, 0, 'Revocation reaches a connected controller');
    assert.equal((await request('/api/access-grants', 'POST', { personId, deviceId, schedule })).status, 201);
    await pool.query(`INSERT INTO access_users(user_id,device_id,name,credential_ciphertext,days_mask,start_minute,end_minute,valid_from)
      SELECT person_id,$2,name,credential_ciphertext,127,0,1440,0 FROM people WHERE person_id=$1`, [personId, deviceId]);
    assert.equal((await request(`/api/people/${personId}`, 'DELETE')).status, 204);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(messages.at(-1)!.users.length, 0);
    const mobileAfter = await fetch(`${base}/api/mobile/access`, { headers: { authorization: `Bearer ${registration.mobileToken}` } });
    assert.equal(mobileAfter.status, 401);
    for (const [table, column] of [['people','person_id'],['mobile_sessions','person_id'],['access_grants','person_id'],['access_users','user_id']]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column}=$1`, [personId])).rows[0].count, 0);
    }
    await initializeDatabase();
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM people WHERE person_id=$1', [personId])).rows[0].count, 0, 'Legacy migration cannot recreate deleted people');
    assert.equal((await request(`/api/people/${personId}`, 'DELETE')).status, 404);
    const closed = new Promise(resolve => ws.addEventListener('close', resolve, { once: true }));
    assert.equal((await request(`/api/devices/${deviceId}`, 'DELETE')).status, 204);
    await closed;
    assert.equal((await fetch(`${base}/api/devices/${deviceId}/sync`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await request(`/api/devices/${deviceId}`, 'PATCH', { name: 'Missing', location: '' })).status, 404);
    assert.equal((await request(`/api/access-grants/${grantId}`, 'PATCH', { schedule })).status, 404);
  } finally {
    for (const socket of sockets) socket.close();
    if (ownerId) await pool.query('UPDATE "user" SET role=\'owner\' WHERE id=$1', [ownerId]);
    await pool.query('DELETE FROM devices WHERE device_id=$1', [deviceId]);
    await pool.query('DELETE FROM access_users WHERE user_id=ANY($1)', [ids]);
    await pool.query('DELETE FROM people WHERE person_id=ANY($1)', [ids]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1)', [adminIds]);
    await pool.end();
    // initializeDatabase uses its own pool.
    const { closeDatabase } = await import('../src/database.js');
    await closeDatabase();
  }
});

