import 'dart:convert';

import 'package:http/http.dart' as http;

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api-project.maxkabechani.dev',
);

class MobilePerson {
  const MobilePerson({
    required this.personId,
    required this.fullName,
    required this.phoneNumber,
  });

  final String personId;
  final String fullName;
  final String phoneNumber;

  factory MobilePerson.fromJson(Map<String, dynamic> json) {
    return MobilePerson(
      personId: json['personId']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      phoneNumber: json['phoneNumber']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'personId': personId,
        'fullName': fullName,
        'phoneNumber': phoneNumber,
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

  bool allowsAt(DateTime localTime) {
    final unixSeconds = localTime.millisecondsSinceEpoch ~/ 1000;
    if (unixSeconds < validFrom) return false;
    if (validUntil != null && unixSeconds >= validUntil!) return false;

    final dayBit = 1 << (localTime.weekday - 1);
    final minute = localTime.hour * 60 + localTime.minute;
    return (daysMask & dayBit) != 0 &&
        minute >= startMinute &&
        minute < endMinute;
  }
}

class MobileAccessSnapshot {
  const MobileAccessSnapshot({
    required this.person,
    required this.credentialKeyHex,
    required this.serverUnixSeconds,
    required this.grants,
  });

  final MobilePerson person;
  final String credentialKeyHex;
  final int serverUnixSeconds;
  final List<MobileGrant> grants;

  factory MobileAccessSnapshot.fromJson(Map<String, dynamic> json) {
    final rawGrants = json['grants'];
    return MobileAccessSnapshot(
      person: MobilePerson.fromJson(
        Map<String, dynamic>.from(json['person'] as Map? ?? const <String, dynamic>{}),
      ),
      credentialKeyHex: json['credentialKeyHex']?.toString() ?? '',
      serverUnixSeconds: (json['serverUnixSeconds'] as num?)?.toInt() ?? 0,
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
    required String phoneNumber,
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
            'phoneNumber': phoneNumber,
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

    return MobileAccessSnapshot.fromJson(body);
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
