import assert from 'node:assert/strict';
import test from 'node:test';
import { controllerDisplayName } from '../src/controller-display.js';

test('LCD names are readable, bounded, and do not change the original name', () => {
  assert.equal(controllerDisplayName('Max Kabechani'), 'Max Kabechani');
  assert.equal(controllerDisplayName('  José\nMwansa  '), 'Jose Mwansa');
  assert.equal(controllerDisplayName(''), 'Authorized user');
  assert.equal(controllerDisplayName('a'.repeat(120)), 'a'.repeat(30));
  assert.equal(controllerDisplayName('王😀'), '??');
});

test('a full 48-user sync with escaped names fits the existing ESP32 frame limit', () => {
  const name = controllerDisplayName('"'.repeat(120));
  const user = {
    userId: 'a'.repeat(36), credentialKeyHex: 'b'.repeat(64), name,
    schedule: { daysMask: 127, startMinute: 1439, endMinute: 1440,
      validFrom: 4294967295, validUntil: 4294967295 },
  };
  const payload = JSON.stringify({ type: 'sync', serverUnixSeconds: 4294967295, users: Array(48).fill(user) });
  assert.ok(Buffer.byteLength(payload) <= 15 * 1024);
});
