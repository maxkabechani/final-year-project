import 'package:cl3_access/security_protocol.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('UUID is encoded as 16 bytes in network order', () {
    expect(
      bytesToHex(uuidToBytes('00112233-4455-6677-8899-aabbccddeeff')),
      '00112233445566778899aabbccddeeff',
    );
  });

  test('P-256 peers derive the same shared secret', () async {
    final ecdh = Ecdh.p256(length: 32);
    final alice = await ecdh.newKeyPair();
    final bob = await ecdh.newKeyPair();
    final aliceShared = await ecdh.sharedSecretKey(
      keyPair: alice,
      remotePublicKey: await bob.extractPublicKey(),
    );
    final bobShared = await ecdh.sharedSecretKey(
      keyPair: bob,
      remotePublicKey: await alice.extractPublicKey(),
    );
    expect(
      await aliceShared.extractBytes(),
      await bobShared.extractBytes(),
    );
  });

  test('access request has the specified byte lengths', () {
    final payload = unlockPayload(
      userId: '00112233-4455-6677-8899-aabbccddeeff',
      proof: List<int>.filled(32, 7),
    );
    expect(payload, hasLength(49));
    expect(payload.first, 0x01);
    expect(
      enrollmentPayload(
        userId: '00112233-4455-6677-8899-aabbccddeeff',
        credential: List<int>.filled(32, 9),
        daysMask: 31,
        startMinute: 480,
        endMinute: 1080,
        validFrom: 1,
        validUntil: 0,
        pairingPin: '123456',
      ),
      hasLength(69),
    );
  });
}
