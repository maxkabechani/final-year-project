import 'dart:convert';

import 'package:http/http.dart' as http;

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api-project.maxkabechani.dev',
);

const accessUtcOffset = Duration(hours: 2);

enum GrantAvailability { allowed, notStarted, expired, wrongDay, outsideHours }

// Use the last server calibration offline, then advance monotonically so a
// phone clock adjustment cannot change the schedule during this app session.
class MobileAccessClock {
  MobileAccessClock({DateTime Function()? deviceNow, Duration Function()? elapsed})
      : _deviceNow = deviceNow ?? DateTime.now {
    _elapsed = elapsed ?? () => _stopwatch.elapsed;
    _stopwatch.start();
  }

  final DateTime Function() _deviceNow;
  final Stopwatch _stopwatch = Stopwatch();
  late final Duration Function() _elapsed;
  DateTime? _anchor;
  Duration _anchorElapsed = Duration.zero;

  void restoreOffset(int offsetMilliseconds) {
    _anchor = _deviceNow().toUtc().add(Duration(milliseconds: offsetMilliseconds));
    _anchorElapsed = _elapsed();
  }

  DateTime now() => _anchor?.add(_elapsed() - _anchorElapsed) ?? _deviceNow().toUtc();
}

class MobilePerson {
  const MobilePerson({
    required this.personId,
    required this.fullName,
    required this.studentNumber,
  });

  final String personId;
  final String fullName;
  final String studentNumber;

  factory MobilePerson.fromJson(Map<String, dynamic> json) {
    return MobilePerson(
      personId: json['personId']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      studentNumber: json['studentNumber']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'personId': personId,
        'fullName': fullName,
        'studentNumber': studentNumber,
      };
}

class MobileGrant {
  const MobileGrant({
    required this.grantId,
    required this.deviceId,
    required this.deviceName,
    required this.location,
    required this.accessType,
    required this.daysMask,
    required this.startMinute,
    required this.endMinute,
    required this.validFrom,
    required this.validUntil,
  });

  final String grantId;
  final String deviceId;
  final String deviceName;
  final String location;
  final String accessType;
  final int daysMask;
  final int startMinute;
  final int endMinute;
  final int validFrom;
  final int? validUntil;

  factory MobileGrant.fromJson(Map<String, dynamic> json) {
    return MobileGrant(
      grantId: json['grantId']?.toString() ?? '',
      deviceId: json['deviceId']?.toString() ?? '',
      deviceName: json['deviceName']?.toString() ?? '',
      location: json['location']?.toString() ?? '',
      accessType: json['accessType']?.toString() ?? 'recurring',
      daysMask: (json['daysMask'] as num?)?.toInt() ?? 0,
      startMinute: (json['startMinute'] as num?)?.toInt() ?? 0,
      endMinute: (json['endMinute'] as num?)?.toInt() ?? 0,
      validFrom: (json['validFrom'] as num?)?.toInt() ?? 0,
      validUntil: (json['validUntil'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'grantId': grantId,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'location': location,
        'accessType': accessType,
        'daysMask': daysMask,
        'startMinute': startMinute,
        'endMinute': endMinute,
        'validFrom': validFrom,
        'validUntil': validUntil,
      };

  GrantAvailability availabilityAt(DateTime instant) {
    final unixSeconds = instant.millisecondsSinceEpoch ~/ 1000;
    if (unixSeconds < validFrom) return GrantAvailability.notStarted;
    if (validUntil != null && unixSeconds >= validUntil!) return GrantAvailability.expired;

    // Match ESP32 scheduleAllows: Monday bit 0, Zambia time, [start, end).
    final localTime = instant.toUtc().add(accessUtcOffset);
    final dayBit = 1 << (localTime.weekday - 1);
    final minute = localTime.hour * 60 + localTime.minute;
    if ((daysMask & dayBit) == 0) return GrantAvailability.wrongDay;
    if (minute < startMinute || minute >= endMinute) return GrantAvailability.outsideHours;
    return GrantAvailability.allowed;
  }

  bool allowsAt(DateTime instant) => availabilityAt(instant) == GrantAvailability.allowed;

  String get scheduleLabel {
    const days = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final selected = <String>[
      for (var day = 0; day < days.length; day++)
        if ((daysMask & (1 << day)) != 0) days[day],
    ];
    String time(int minute) => '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}';
    return '${selected.join(', ')} · ${time(startMinute)}–${time(endMinute)} · Zambia time';
  }
}

class MobileAccessSnapshot {
  const MobileAccessSnapshot({
    required this.person,
    required this.credentialKeyHex,
    required this.serverUnixSeconds,
    required this.grants,
    this.clockOffsetMilliseconds = 0,
  });

  final MobilePerson person;
  final String credentialKeyHex;
  final int serverUnixSeconds;
  final List<MobileGrant> grants;
  final int clockOffsetMilliseconds;

  factory MobileAccessSnapshot.fromJson(Map<String, dynamic> json, {DateTime? receivedAt}) {
    final rawGrants = json['grants'];
    final serverUnixSeconds = (json['serverUnixSeconds'] as num?)?.toInt() ?? 0;
    return MobileAccessSnapshot(
      person: MobilePerson.fromJson(
        Map<String, dynamic>.from(json['person'] as Map? ?? const <String, dynamic>{}),
      ),
      credentialKeyHex: json['credentialKeyHex']?.toString() ?? '',
      serverUnixSeconds: serverUnixSeconds,
      clockOffsetMilliseconds: receivedAt != null && serverUnixSeconds > 0
          ? serverUnixSeconds * 1000 - receivedAt.millisecondsSinceEpoch
          : (json['clockOffsetMilliseconds'] as num?)?.toInt() ?? 0,
      grants: rawGrants is List
          ? rawGrants
              .whereType<Map>()
              .map((item) => MobileGrant.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : <MobileGrant>[],
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'person': person.toJson(),
        'credentialKeyHex': credentialKeyHex,
        'serverUnixSeconds': serverUnixSeconds,
        'clockOffsetMilliseconds': clockOffsetMilliseconds,
        'grants': grants.map((grant) => grant.toJson()).toList(),
      };

  MobileGrant? grantFor(String deviceId) {
    for (final grant in grants) {
      if (grant.deviceId == deviceId) return grant;
    }
    return null;
  }
}

class MobileRegistration {
  const MobileRegistration({
    required this.mobileToken,
    required this.person,
  });

  final String mobileToken;
  final MobilePerson person;
}

class MobileApi {
  MobileApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<MobileRegistration> register({
    required String fullName,
    required String studentNumber,
    required String installationId,
    required String deviceLabel,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$apiBaseUrl/api/mobile/register'),
          headers: const <String, String>{
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: jsonEncode(<String, Object>{
            'fullName': fullName,
            'studentNumber': studentNumber,
            'installationId': installationId,
            'deviceLabel': deviceLabel,
          }),
        )
        .timeout(const Duration(seconds: 12));

    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FormatException(body['error']?.toString() ?? 'Registration failed.');
    }

    return MobileRegistration(
      mobileToken: body['mobileToken']?.toString() ?? '',
      person: MobilePerson.fromJson(
        Map<String, dynamic>.from(body['person'] as Map? ?? const <String, dynamic>{}),
      ),
    );
  }

  Future<MobileAccessSnapshot> fetchAccess(String mobileToken) async {
    final response = await _client
        .get(
          Uri.parse('$apiBaseUrl/api/mobile/access'),
          headers: <String, String>{
            'accept': 'application/json',
            'authorization': 'Bearer $mobileToken',
          },
        )
        .timeout(const Duration(seconds: 12));

    final body = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw MobileApiException(
        body['error']?.toString() ?? 'Could not refresh access.',
        statusCode: response.statusCode,
      );
    }

    return MobileAccessSnapshot.fromJson(body, receivedAt: DateTime.now());
  }

  Map<String, dynamic> _decode(http.Response response) {
    try {
      final value = jsonDecode(response.body);
      return value is Map<String, dynamic> ? value : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  void close() => _client.close();
}

class MobileApiException implements Exception {
  const MobileApiException(this.message, {required this.statusCode});

  final String message;
  final int statusCode;

  @override
  String toString() => message;
}

