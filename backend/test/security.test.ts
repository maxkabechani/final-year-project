import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constantTimeHexEqual,
  decryptCredentialHex,
  encryptCredentialHex,
  newDeviceToken,
  scheduleAllows,
  tokenHash,
} from '../src/crypto.js';

const master = '0123456789abcdef'.repeat(4);

test('credential encryption authenticates and round trips', () => {
  const key = 'a1'.repeat(32);
  const stored = encryptCredentialHex(key, master);
  assert.notEqual(stored, key);
  assert.equal(decryptCredentialHex(stored, master), key);
  assert.throws(() => decryptCredentialHex(stored, 'ff'.repeat(32)));
});

test('device tokens are random and stored as one-way hashes', () => {
  const first = newDeviceToken();
  const second = newDeviceToken();
  assert.notEqual(first, second);
  assert.equal(tokenHash(first).length, 64);
  assert.equal(constantTimeHexEqual(tokenHash(first), tokenHash(first)), true);
  assert.equal(constantTimeHexEqual(tokenHash(first), tokenHash(second)), false);
});

test('schedule check applies Monday-first mask and Lusaka UTC+2 time', () => {
  const schedule = {
    daysMask: 1,
    startMinute: 8 * 60,
    endMinute: 18 * 60,
    validFrom: 0,
    validUntil: null,
  };
  const mondayAtEightLusaka = Date.UTC(2026, 9, 12, 6, 0) / 1000;
  const mondayBeforeEight = Date.UTC(2026, 9, 12, 5, 59) / 1000;
  assert.equal(scheduleAllows(schedule, mondayAtEightLusaka), true);
  assert.equal(scheduleAllows(schedule, mondayBeforeEight), false);
});
