type JsonObject = Record<string, unknown>;
let latestCredentialJson = '';

const byId = (id: string): HTMLElement => {
  const value = document.getElementById(id);
  if (!value) throw new Error('Missing page element: ' + id);
  return value;
};

const valueOf = (id: string): string => (byId(id) as HTMLInputElement).value.trim();

function apiBase(): string {
  const raw = valueOf('api') || window.location.origin;
  return raw.replace(/\/+$/, '');
}

async function request(path: string, options: RequestInit = {}): Promise<JsonObject> {
  const response = await fetch(apiBase() + path, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + valueOf('token'),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return {};
  const body = await response.json() as JsonObject;
  if (!response.ok) throw new Error(String(body.error ?? 'Request failed'));
  return body;
}

function setStatus(message: string): void {
  byId('status').textContent = message;
}

function makeCell(row: HTMLTableRowElement, text: string): void {
  const cell = row.insertCell();
  cell.textContent = text;
}

async function loadData(): Promise<void> {
  setStatus('Loading…');
  const devices = await request('/api/devices');
  const deviceBody = byId('devices');
  deviceBody.replaceChildren();
  for (const device of (devices.devices ?? []) as JsonObject[]) {
    const row = document.createElement('tr');
    makeCell(row, String(device.deviceId ?? ''));
    makeCell(row, String(device.name ?? ''));
    makeCell(row, new Date(String(device.createdAt)).toLocaleString());
    deviceBody.append(row);
  }
  const deviceId = encodeURIComponent(valueOf('eventDevice'));
  const eventResult = await request('/api/devices/' + deviceId + '/events');
  const eventBody = byId('events');
  eventBody.replaceChildren();
  for (const event of (eventResult.events ?? []) as JsonObject[]) {
    const row = document.createElement('tr');
    makeCell(row, new Date(String(event.occurredAt)).toLocaleString());
    makeCell(row, String(event.type ?? ''));
    makeCell(row, String(event.userId ?? ''));
    makeCell(row, String(event.detail ?? ''));
    eventBody.append(row);
  }
  setStatus('Data loaded.');
}

async function loadUsers(): Promise<void> {
  const deviceId = encodeURIComponent(valueOf('usersDevice'));
  const result = await request('/api/devices/' + deviceId + '/users');
  const target = byId('userList');
  target.replaceChildren();
  for (const user of (result.users ?? []) as JsonObject[]) {
    const row = document.createElement('tr');
    makeCell(row, String(user.name ?? ''));
    makeCell(row, String(user.userId ?? ''));
    const schedule = user.schedule as JsonObject;
    makeCell(row, String(schedule.daysMask ?? ''));
    makeCell(row, String(schedule.startMinute ?? '') + '–' + String(schedule.endMinute ?? ''));
    const action = row.insertCell();
    const revoke = document.createElement('button');
    revoke.textContent = 'Revoke';
    revoke.addEventListener('click', () => {
      void request('/api/devices/' + deviceId + '/users/' +
        encodeURIComponent(String(user.userId)), { method: 'DELETE' })
        .then(loadUsers)
        .then(() => setStatus('User revoked. The controller will remove it on its next sync.'))
        .catch((error: unknown) => setStatus(String(error)));
    });
    action.append(revoke);
    target.append(row);
  }
  if (target.childElementCount === 0) setStatus('No active users for this controller.');
}

byId('load').addEventListener('click', () => {
  void loadData().catch((error: unknown) => setStatus(String(error)));
});

byId('loadUsers').addEventListener('click', () => {
  void loadUsers().catch((error: unknown) => setStatus(String(error)));
});

byId('register').addEventListener('click', () => {
  void request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ deviceId: valueOf('deviceId'), name: valueOf('deviceName') }),
  }).then(async (result) => {
    const target = byId('deviceToken');
    target.hidden = false;
    target.textContent = 'Copy this device token into firmware/include/config.h now. It will not be shown again: ' + String(result.deviceToken);
    (byId('userDevice') as HTMLInputElement).value = valueOf('deviceId');
    (byId('eventDevice') as HTMLInputElement).value = valueOf('deviceId');
    (byId('usersDevice') as HTMLInputElement).value = valueOf('deviceId');
    setStatus('Controller registered.');
    await loadData();
  }).catch((error: unknown) => setStatus(String(error)));
});

byId('createUser').addEventListener('click', () => {
  const parseMinute = (value: string): number => {
    const parts = value.split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  };
  const now = Math.floor(Date.now() / 1000);
  const startMinute = parseMinute(valueOf('start'));
  const endMinute = parseMinute(valueOf('end'));
  if (startMinute >= endMinute) {
    setStatus('End time must be after start time.');
    return;
  }
  void request('/api/devices/' + encodeURIComponent(valueOf('userDevice')) + '/users', {
    method: 'POST',
    body: JSON.stringify({
      name: valueOf('userName'),
      schedule: {
        daysMask: Number((byId('days') as HTMLSelectElement).value),
        startMinute,
        endMinute,
        validFrom: now,
        validUntil: null,
      },
    }),
  }).then((result) => {
    const target = byId('credential');
    target.hidden = false;
    const exportValue = {
      userId: result.userId,
      credentialKeyHex: result.credentialKeyHex,
      schedule: result.schedule,
    };
    latestCredentialJson = JSON.stringify(exportValue);
    target.textContent = latestCredentialJson;
    byId('copyCredential').hidden = false;
    void loadUsers().catch((error: unknown) => setStatus(String(error)));
    setStatus('User created. Copy the private credential JSON into the phone app.');
  }).catch((error: unknown) => setStatus(String(error)));
});

byId('copyCredential').addEventListener('click', () => {
  if (!navigator.clipboard) {
    setStatus('Select the credential JSON above and copy it into the phone app.');
    return;
  }
  void navigator.clipboard.writeText(latestCredentialJson)
    .then(() => setStatus('Credential JSON copied. Paste it into the phone app.'))
    .catch((error: unknown) => setStatus(String(error)));
});

if (window.location.protocol === 'https:') {
  (byId('api') as HTMLInputElement).value = window.location.origin;
}
