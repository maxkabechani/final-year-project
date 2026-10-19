import 'package:flutter_test/flutter_test.dart';
import 'package:smart_access/mobile_api.dart';

MobileGrant grant({int daysMask = 1, int startMinute = 480, int endMinute = 1080,
    int validFrom = 0, int? validUntil}) => MobileGrant(
  grantId: 'grant', deviceId: 'front-door-01', deviceName: 'Front Door',
  location: 'Main Building', accessType: 'recurring', daysMask: daysMask,
  startMinute: startMinute, endMinute: endMinute,
  validFrom: validFrom, validUntil: validUntil,
);

void main() {
  test('08:00-18:00 Zambia schedule matches UTC and offset inputs', () {
    final access = grant();
    expect(access.allowsAt(DateTime.parse('2026-10-19T08:30:00+02:00')), isTrue);
    expect(access.allowsAt(DateTime.parse('2026-10-18T23:30:00-07:00')), isTrue);
    expect(access.allowsAt(DateTime.utc(2026, 10, 19, 6, 30)), isTrue);
    expect(access.allowsAt(DateTime.utc(2026, 10, 19, 5, 59, 59)), isFalse);
    expect(access.allowsAt(DateTime.utc(2026, 10, 19, 6)), isTrue);
    expect(access.allowsAt(DateTime.utc(2026, 10, 19, 15, 59, 59)), isTrue);
    expect(access.allowsAt(DateTime.utc(2026, 10, 19, 16)), isFalse);
  });

  test('weekday follows Zambia midnight, including Sunday to Monday', () {
    final monday = grant(startMinute: 0, endMinute: 1440);
    expect(monday.availabilityAt(DateTime.utc(2026, 10, 18, 21, 59, 59)), GrantAvailability.wrongDay);
    expect(monday.allowsAt(DateTime.utc(2026, 10, 18, 22)), isTrue);
    expect(monday.allowsAt(DateTime.utc(2026, 10, 19, 21, 59, 59)), isTrue);
    expect(monday.availabilityAt(DateTime.utc(2026, 10, 19, 22)), GrantAvailability.wrongDay);
  });

  test('absolute validity and daily window both apply to one-off access', () {
    final start = DateTime.utc(2026, 10, 19, 6);
    final end = DateTime.utc(2026, 10, 19, 7);
    final access = grant(validFrom: start.millisecondsSinceEpoch ~/ 1000,
      validUntil: end.millisecondsSinceEpoch ~/ 1000);
    expect(access.availabilityAt(start.subtract(const Duration(seconds: 1))), GrantAvailability.notStarted);
    expect(access.allowsAt(start), isTrue);
    expect(access.allowsAt(end.subtract(const Duration(seconds: 1))), isTrue);
    expect(access.availabilityAt(end), GrantAvailability.expired);
  });

  test('server clock corrects a phone that is hours ahead and advances offline', () {
    var deviceTime = DateTime.utc(2026, 10, 19, 12, 30);
    var elapsed = Duration.zero;
    final serverTime = DateTime.utc(2026, 10, 19, 6, 30);
    final snapshot = MobileAccessSnapshot.fromJson(<String, dynamic>{
      'serverUnixSeconds': serverTime.millisecondsSinceEpoch ~/ 1000,
    }, receivedAt: deviceTime);
    final clock = MobileAccessClock(deviceNow: () => deviceTime, elapsed: () => elapsed);
    clock.restoreOffset(snapshot.clockOffsetMilliseconds);
    expect(clock.now(), serverTime);
    expect(grant().allowsAt(clock.now()), isTrue);
    deviceTime = deviceTime.subtract(const Duration(days: 3));
    elapsed = const Duration(minutes: 5);
    expect(clock.now(), serverTime.add(const Duration(minutes: 5)));
  });

  test('cached calibration advances from current time instead of replaying old server time', () {
    final serverTime = DateTime.utc(2026, 10, 19, 6, 30);
    final deviceTime = serverTime.add(const Duration(hours: 6));
    final fetched = MobileAccessSnapshot.fromJson(<String, dynamic>{
      'serverUnixSeconds': serverTime.millisecondsSinceEpoch ~/ 1000,
    }, receivedAt: deviceTime);
    final cached = MobileAccessSnapshot.fromJson(fetched.toJson());
    final clock = MobileAccessClock(deviceNow: () => deviceTime.add(const Duration(days: 1)));
    clock.restoreOffset(cached.clockOffsetMilliseconds);
    expect(clock.now().difference(serverTime.add(const Duration(days: 1))).inSeconds, 0);
    final legacy = MobileAccessSnapshot.fromJson(<String, dynamic>{
      'serverUnixSeconds': serverTime.millisecondsSinceEpoch ~/ 1000,
    });
    expect(legacy.clockOffsetMilliseconds, 0);
  });
}
