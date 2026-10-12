import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

const String bleServiceUuid = '9b8e0001-61d0-4f10-9c2a-71f4c05a0001';
const String bleControlUuid = '9b8e0002-61d0-4f10-9c2a-71f4c05a0001';
const String bleMessageUuid = '9b8e0003-61d0-4f10-9c2a-71f4c05a0001';

class AccessProtocol {
  AccessProtocol._(
    this.deviceId,
    this.challenge,
    this.phonePublicKey,
    this.controllerPublicKey,
    this.mode,
    this._sessionKey,
  );

  final String deviceId;
  final List<int> challenge;
  final List<int> phonePublicKey;
  final List<int> controllerPublicKey;
  final int mode;
  final SecretKey _sessionKey;

  static final Ecdh _ecdh = Ecdh.p256(length: 32);
  static final AesGcm _aes = AesGcm.with128bits();

  static Future<KeyPair> newPhoneKeyPair() => _ecdh.newKeyPair();

  static Future<List<int>> helloValue(KeyPair keyPair) async {
    final publicKey = await keyPair.extractPublicKey();
    if (publicKey is! EcPublicKey) {
      throw StateError('P-256 key pair returned an unexpected public key');
    }
    return <int>[0x01, ...publicKey.x, ...publicKey.y];
  }

  static Future<AccessProtocol> fromChallenge({
    required String deviceId,
    required KeyPair phoneKeyPair,
    required List<int> message,
  }) async {
    if (message.length != 82 || message[0] != 0x02) {
      throw const FormatException('Invalid controller challenge');
    }
    final challenge = message.sublist(1, 17);
    final controllerBytes = message.sublist(17, 81);
    final mode = message[81];
    final remoteKey = EcPublicKey(
      x: controllerBytes.sublist(0, 32),
      y: controllerBytes.sublist(32, 64),
      type: _ecdh.keyPairType,
    );
    final shared = await _ecdh.sharedSecretKey(
      keyPair: phoneKeyPair,
      remotePublicKey: remoteKey,
    );
    final deviceBytes = utf8.encode(deviceId);
    final info = <int>[
      ...ascii.encode('CL3-AES128-V1|'),
      deviceBytes.length,
      ...deviceBytes,
    ];
    final sessionKey = await Hkdf(
      hmac: Hmac.sha256(),
      outputLength: 16,
    ).deriveKey(
      secretKey: shared,
      nonce: challenge,
      info: info,
    );
    final phonePublic = (await helloValue(phoneKeyPair)).sublist(1);
    return AccessProtocol._(
      deviceId,
      challenge,
      phonePublic,
      controllerBytes,
      mode,
      sessionKey,
    );
  }

  Future<List<int>> proof({
    required String userId,
    required List<int> credential,
    required int operation,
  }) async {
    final transcript = _proofTranscript(userId, operation);
    final mac = await Hmac.sha256().calculateMac(
      transcript,
      secretKey: SecretKey(credential),
    );
    return mac.bytes;
  }

  Future<List<int>> encryptPayload(List<int> payload) async {
    final box = await _aes.encrypt(
      payload,
      secretKey: _sessionKey,
      nonce: _aes.newNonce(),
      aad: _associatedData(),
    );
    return <int>[0x03, ...box.nonce, ...box.cipherText, ...box.mac.bytes];
  }

  Future<List<int>> decryptResult(List<int> message) async {
    if (message.length < 30 || message[0] != 0x04) {
      throw const FormatException('Invalid controller result');
    }
    final nonce = message.sublist(1, 13);
    final tag = message.sublist(message.length - 16);
    final ciphertext = message.sublist(13, message.length - 16);
    final box = SecretBox(
      ciphertext,
      nonce: nonce,
      mac: Mac(tag),
    );
    return _aes.decrypt(
      box,
      secretKey: _sessionKey,
      aad: <int>[..._associatedData(), ...ascii.encode('CL3-RESULT')],
    );
  }

  List<int> _associatedData() => <int>[
        ...ascii.encode('CL3-AAD-V1|'),
        utf8.encode(deviceId).length,
        ...utf8.encode(deviceId),
        ...challenge,
        ...phonePublicKey,
        ...controllerPublicKey,
      ];

  List<int> _proofTranscript(String userId, int operation) => <int>[
        ...ascii.encode('CL3-HMAC-V1|'),
        utf8.encode(deviceId).length,
        ...utf8.encode(deviceId),
        ...challenge,
        ...phonePublicKey,
        ...controllerPublicKey,
        ...uuidToBytes(userId),
        operation,
      ];
}

List<int> uuidToBytes(String value) {
  final compact = value.replaceAll('-', '').toLowerCase();
  if (!RegExp(r'^[0-9a-f]{32}$').hasMatch(compact)) {
    throw const FormatException('User ID must be a UUID');
  }
  return hexToBytes(compact);
}

String bytesToHex(List<int> bytes) =>
    bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();

Uint8List hexToBytes(String hex) {
  if (hex.length.isOdd || !RegExp(r'^[0-9a-fA-F]*$').hasMatch(hex)) {
    throw const FormatException('Invalid hexadecimal data');
  }
  return Uint8List.fromList(
    List<int>.generate(
      hex.length ~/ 2,
      (index) => int.parse(hex.substring(index * 2, index * 2 + 2), radix: 16),
    ),
  );
}

List<int> packUint16(int value) => <int>[value & 0xff, (value >> 8) & 0xff];

List<int> packUint32(int value) => <int>[
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    ];

List<int> unlockPayload({
  required String userId,
  required List<int> proof,
}) {
  if (proof.length != 32) {
    throw ArgumentError.value(proof.length, 'proof', 'must be 32 bytes');
  }
  return <int>[0x01, ...uuidToBytes(userId), ...proof];
}

List<int> enrollmentPayload({
  required String userId,
  required List<int> credential,
  required int daysMask,
  required int startMinute,
  required int endMinute,
  required int validFrom,
  required int validUntil,
  required String pairingPin,
}) {
  if (credential.length != 32 ||
      pairingPin.length != 6 ||
      !RegExp(r'^[0-9]{6}$').hasMatch(pairingPin)) {
    throw const FormatException('Invalid enrollment credential or PIN');
  }
  return <int>[
    0x02,
    ...uuidToBytes(userId),
    ...credential,
    daysMask & 0x7f,
    ...packUint16(startMinute),
    ...packUint16(endMinute),
    ...packUint32(validFrom),
    ...packUint32(validUntil),
    ...ascii.encode(pairingPin),
    0,
  ];
}
