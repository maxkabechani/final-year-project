import 'dart:convert';

import 'package:http/http.dart' as http;

class BackendClient {
  BackendClient(String baseUrl, this.adminToken)
      : baseUrl = _normaliseBaseUrl(baseUrl);

  final String baseUrl;
  final String adminToken;

  static String _normaliseBaseUrl(String value) {
    final trimmed = value.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    if (uri == null ||
        !uri.hasScheme ||
        (uri.scheme != 'https' && uri.scheme != 'http') ||
        uri.host.isEmpty) {
      throw const FormatException('Enter a valid backend URL');
    }
    return trimmed;
  }

  Future<Map<String, dynamic>> registerDevice({
    required String deviceId,
    required String name,
  }) async {
    return _request(
      'POST',
      '/api/devices',
      body: <String, Object?>{'deviceId': deviceId, 'name': name},
    );
  }

  Future<Map<String, dynamic>> createUser({
    required String deviceId,
    required String name,
    required int daysMask,
    required int startMinute,
    required int endMinute,
    required int validFrom,
    required int validUntil,
  }) async {
    return _request(
      'POST',
      '/api/devices/$deviceId/users',
      body: <String, Object?>{
        'name': name,
        'schedule': <String, Object?>{
          'daysMask': daysMask,
          'startMinute': startMinute,
          'endMinute': endMinute,
          'validFrom': validFrom,
          'validUntil': validUntil == 0 ? null : validUntil,
        },
      },
    );
  }

  Future<List<Map<String, dynamic>>> events(String deviceId) async {
    final result = await _request('GET', '/api/devices/$deviceId/events');
    final items = result['events'];
    if (items is! List) {
      return const <Map<String, dynamic>>[];
    }
    return items
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, Object?>? body,
  }) async {
    final uri = Uri.parse(baseUrl + path);
    final headers = <String, String>{
      'accept': 'application/json',
      'authorization': 'Bearer ' + adminToken.trim(),
    };
    if (body != null) {
      headers['content-type'] = 'application/json';
    }
    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) {
      request.body = jsonEncode(body);
    }
    final client = http.Client();
    try {
      final response = await client.send(request);
      final text = await response.stream.bytesToString();
      final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = decoded is Map<String, dynamic>
            ? (decoded['error'] ?? decoded['message'] ?? 'Request failed')
            : 'Request failed';
        throw Exception(message.toString());
      }
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Backend returned invalid JSON');
      }
      return decoded;
    } finally {
      client.close();
    }
  }
}
