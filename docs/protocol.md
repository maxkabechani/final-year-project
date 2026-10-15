# BLE and access protocol

This document is the contract shared by the Flutter app and ESP32 firmware. Keep the UUIDs, byte order, transcript, key derivation, and wire formats in sync.

## Layers

1. A foreground phone connects to the controller over BLE GATT.
2. The phone asks Android for a biometric confirmation before using its stored access credential.
3. The phone and ESP32 exchange fresh P-256 ECDH public keys and a 128-bit controller nonce.
4. HKDF-SHA256 derives a 128-bit AES key for the connection. The app encrypts its request with AES-128-GCM.
5. The request contains an HMAC-SHA256 proof made with the user's 256-bit credential. The controller checks the proof, RTC timetable, and credential status.
6. The relay can unlock for at most five seconds. The result is encrypted and the event is queued locally for later API synchronization.

The nonce is random, expires after 15 seconds, and is consumed by the first request. A captured encrypted request cannot be replayed in a later session.

## GATT identifiers

- Service: 9b8e0001-61d0-4f10-9c2a-71f4c05a0001
- Control characteristic (write): 9b8e0002-61d0-4f10-9c2a-71f4c05a0001
- Message characteristic (notify): 9b8e0003-61d0-4f10-9c2a-71f4c05a0001

All integers use little-endian unless this document says otherwise. A P-256 public key is raw x followed by raw y, 32 bytes each, without the 0x04 SEC1 prefix.

### HELLO

The phone writes 65 bytes:

- byte 0: 0x01
- bytes 1..64: phone P-256 public key x || y

The controller notifies 82 bytes:

- byte 0: 0x02
- bytes 1..16: random challenge
- bytes 17..80: controller P-256 public key x || y
- byte 81: mode (0 locked/normal, 1 physical pairing window)

The device ID is configured in firmware and is entered in the phone app. It is included in the key derivation and authenticated transcript.

### AES key and associated data

Compute the ECDH P-256 shared secret. Derive 16 bytes using HKDF-SHA256:

- input key material: ECDH shared secret
- salt: the 16-byte challenge
- info: ASCII SMART-ACCESS-AES128-V1|, one byte containing the UTF-8 device ID length, then the UTF-8 device ID

AES-GCM uses a 12-byte random nonce and a 16-byte tag. Associated data is:

- ASCII SMART-ACCESS-AAD-V1|
- one byte containing the UTF-8 device ID length, then the UTF-8 device ID
- 16-byte challenge
- phone public key (64 bytes)
- controller public key (64 bytes)

### Access request

The phone writes:

- byte 0: 0x03
- bytes 1..12: AES-GCM nonce
- bytes 13..N: ciphertext
- last 16 bytes: AES-GCM tag

The decrypted payload for an unlock request is 49 bytes:

- byte 0: operation 0x01 (unlock)
- bytes 1..16: user UUID in network byte order
- bytes 17..48: HMAC-SHA256 proof

The proof is HMAC-SHA256 keyed by the user's 32-byte credential over:

- ASCII SMART-ACCESS-HMAC-V1|
- one byte containing the UTF-8 device ID length, then the UTF-8 device ID
- 16-byte challenge
- phone public key (64 bytes)
- controller public key (64 bytes)
- 16-byte user UUID
- operation byte 0x01

The controller validates the tag, proof, one-time challenge, credential status, and local timetable. It then emits a separately encrypted result notification.

The result notification is byte 0x04, a 12-byte random AES-GCM nonce, ciphertext, and a 16-byte tag. Its plaintext is one status byte. Result associated data is the request associated data followed by ASCII SMART-ACCESS-RESULT.

### Enrollment request

Enrollment uses the same ECDH/AES-GCM session, and is accepted only during the physical pairing window. The LCD shows a six-digit PIN for 120 seconds after the exit button is held for five seconds.

The decrypted enrollment payload is 69 bytes:

- byte 0: operation 0x02 (enroll)
- bytes 1..16: user UUID in network byte order
- bytes 17..48: 32-byte user credential
- byte 49: days mask, bit 0 Monday through bit 6 Sunday
- bytes 50..51: start minute of day
- bytes 52..53: end minute of day
- bytes 54..57: valid-from Unix seconds
- bytes 58..61: valid-until Unix seconds, zero means no end date
- bytes 62..67: six ASCII digits shown by the LCD
- byte 68: reserved, set to zero

The firmware rate-limits incorrect pairing PIN attempts and exits pairing mode after successful enrollment or timeout.

## Access schedule

The controller evaluates the DS3231 clock in Africa/Lusaka local time (UTC+02:00). A credential is valid only when its date range, day mask, and time interval all match. The interval is start-inclusive and end-exclusive. Schedules that cross midnight should be split into two intervals by the administrator.

The RTC stores UTC. A trusted HTTPS device sync may set it from the backend time endpoint. On a first-time offline installation, successful physical enrollment can initialize an invalid RTC from the administrator phone's valid-from timestamp. Keep the RTC backup battery installed after setup.

If the RTC is not valid, the controller denies scheduled access. Exit-button egress remains available.

Encrypted result plaintext status values are 0x10 granted, 0x11 invalid or unknown credential, 0x12 schedule denied, 0x13 enrollment succeeded, 0x14 pairing denied or closed, and 0x16 invalid RTC.

## Event synchronization

The controller records grants, denials, exits, and door state changes in a bounded flash queue. Wi-Fi sends queued events to the backend when available. API access is not part of the BLE unlock decision.
