import 'package:flutter_test/flutter_test.dart';
import 'package:smart_access/mobile_api.dart';

void main() {
  test('recurring access grant only allows selected day and time', () {
    final mondayMorning = DateTime(2026, 10, 19, 9);
    final mondayEvening = DateTime(2026, 10, 19, 19);
    final tuesdayMorning = DateTime(2026, 10, 20, 9);

    final grant = MobileGrant(
      grantId: 'grant',
      deviceId: 'front-door-01',
      deviceName: 'Front Door',
      location: 'Main Building',
      accessType: 'recurring',
      daysMask: 1,
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      validFrom: mondayMorning.millisecondsSinceEpoch ~/ 1000 - 60,
      validUntil: null,
    );

    expect(grant.allowsAt(mondayMorning), isTrue);
    expect(grant.allowsAt(mondayEvening), isFalse);
    expect(grant.allowsAt(tuesdayMorning), isFalse);
  });
}
