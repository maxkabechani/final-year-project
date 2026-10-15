import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function sameSecret(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  return constantTimeHexEqual(tokenHash(candidate), tokenHash(expected));
}

export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function newCredential(): Buffer {
  return randomBytes(32);
}

function checkedMasterKey(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('CREDENTIAL_MASTER_KEY must contain exactly 64 hex characters');
  }
  return Buffer.from(value, 'hex');
}

export function encryptCredentialHex(credentialHex: string, masterHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(credentialHex)) {
    throw new Error('A user credential must be 32 bytes');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', checkedMasterKey(masterHex), iv);
  cipher.setAAD(Buffer.from('SMART-ACCESS-CREDENTIAL-V1', 'ascii'));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(credentialHex, 'hex')),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptCredentialHex(value: string, masterHex: string): string {
  const packed = Buffer.from(value, 'base64');
  if (packed.length !== 60) {
    throw new Error('Stored credential has an invalid length');
  }
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const key = checkedMasterKey(masterHex);
  for (const aad of ['SMART-ACCESS-CREDENTIAL-V1', 'CL3-CREDENTIAL-V1']) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(aad, 'ascii'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('hex');
    } catch {
      // Try the legacy AAD so existing encrypted credentials still work.
    }
  }
  throw new Error('Stored credential could not be decrypted');
}

export function scheduleAllows(
  schedule: {
    daysMask: number;
    startMinute: number;
    endMinute: number;
    validFrom: number;
    validUntil: number | null;
  },
  utcSeconds: number,
): boolean {
  const local = new Date((utcSeconds + 2 * 60 * 60) * 1000);
  const dayBit = 1 << ((local.getUTCDay() + 6) % 7);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return utcSeconds >= schedule.validFrom &&
    (schedule.validUntil === null || utcSeconds < schedule.validUntil) &&
    (schedule.daysMask & dayBit) !== 0 &&
    minute >= schedule.startMinute &&
    minute < schedule.endMinute;
}
