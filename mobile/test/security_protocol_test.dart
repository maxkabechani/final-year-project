import 'package:cl3_access/security_protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('UUID is encoded as 16 bytes in network order', () {
    expect(
      bytesToHex(uuidToBytes('00112233-4455-6677-8899-aabbccddeeff')),
      '00112233445566778899aabbccddeeff',
    );
  });

  test('P-256 controller challenge derives a phone session', () async {
    const deviceId = 'cl3-door-01';
    final phone = AccessProtocol.newPhoneKeyPair();
    final controller = AccessProtocol.newPhoneKeyPair();
    final controllerHello = AccessProtocol.helloValue(controller);
    final nonce = List<int>.generate(16, (index) => index);
    final challenge = <int>[
      0x02,
      ...nonce,
      ...controllerHello.sublist(1),
      0x01,
    ];
    final session = await AccessProtocol.fromChallenge(
      deviceId: deviceId,
      phoneKeyPair: phone,
      message: challenge,
    );

    expect(controllerHello, hasLength(65));
    expect(controllerHello.first, 0x01);
    expect(session.challenge, nonce);
    expect(session.phonePublicKey, AccessProtocol.helloValue(phone).sublist(1));
    expect(session.controllerPublicKey, controllerHello.sublist(1));
    expect(
      await session.proof(
        userId: '00112233-4455-6677-8899-aabbccddeeff',
        credential: List<int>.filled(32, 5),
        operation: 0x01,
      ),
      hasLength(32),
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
