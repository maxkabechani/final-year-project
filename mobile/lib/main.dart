import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cl3_access/backend_client.dart';
import 'package:cl3_access/security_protocol.dart';
import 'package:cryptography/cryptography.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const Cl3AccessApp());
}

class Cl3AccessApp extends StatelessWidget {
  const Cl3AccessApp({super.key});

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xff1d285f);
    return MaterialApp(
      title: 'CL3 Access',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff087f8c),
          primary: navy,
        ),
        scaffoldBackgroundColor: const Color(0xfff4f6fb),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          isDense: true,
        ),
      ),
      home: const AccessHomePage(),
    );
  }
}

class AccessHomePage extends StatefulWidget {
  const AccessHomePage({super.key});

  @override
  State<AccessHomePage> createState() => _AccessHomePageState();
}

class _AccessHomePageState extends State<AccessHomePage> {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static const LocalAuthentication _localAuth = LocalAuthentication();

  final _apiUrl = TextEditingController();
  final _adminToken = TextEditingController();
  final _deviceId = TextEditingController(text: 'cl3-door-01');
  final _deviceName = TextEditingController(text: 'CL3 Laboratory Door');
  final _userName = TextEditingController(text: 'Student');
  final _pairingPin = TextEditingController();
  final _credentialImport = TextEditingController();

  BluetoothDevice? _device;
  BluetoothCharacteristic? _control;
  BluetoothCharacteristic? _messages;
  StreamSubscription<List<ScanResult>>? _scanSubscription;
  StreamSubscription<List<int>>? _messageSubscription;
  Completer<List<int>>? _pendingMessage;
  int? _pendingOpcode;
  bool _busy = false;
  String _status = 'Controller disconnected';
  String? _credentialUserId;
  List<Map<String, dynamic>> _recentEvents = const [];
  final Set<int> _selectedDays = {1, 2, 3, 4, 5};
  TimeOfDay _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 18, minute: 0);

  int get _daysMask =>
      _selectedDays.fold<int>(0, (mask, day) => mask | (1 << (day - 1)));

  int get _startMinute => _startTime.hour * 60 + _startTime.minute;
  int get _endMinute => _endTime.hour * 60 + _endTime.minute;

  @override
  void dispose() {
    _apiUrl.dispose();
    _adminToken.dispose();
    _deviceId.dispose();
    _deviceName.dispose();
    _userName.dispose();
    _pairingPin.dispose();
    _credentialImport.dispose();
    _scanSubscription?.cancel();
    _messageSubscription?.cancel();
    _device?.disconnect();
    super.dispose();
  }

  BackendClient _backend() =>
      BackendClient(_apiUrl.text, _adminToken.text);

  Future<void> _runBusy(
    String message,
    Future<void> Function() action,
  ) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _status = message;
    });
    try {
      await action();
    } catch (error) {
      _setStatus(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _setStatus(String message) {
    if (mounted) setState(() => _status = message);
  }

  Future<void> _registerDevice() => _runBusy(
        'Registering controller…',
        () async {
          final result = await _backend().registerDevice(
            deviceId: _deviceId.text.trim(),
            name: _deviceName.text.trim(),
          );
          final deviceId = result['deviceId']?.toString() ?? '';
          final token = result['deviceToken']?.toString() ?? '';
          if (deviceId.isEmpty || token.isEmpty) {
            throw const FormatException('Backend did not return a device token');
          }
          _deviceId.text = deviceId;
          await Clipboard.setData(ClipboardData(text: token));
          _setStatus(
            'Controller registered. Device token copied; add it to firmware/include/config.h.',
          );
        },
      );

  Future<void> _createCredential() => _runBusy(
        'Creating user credential…',
        () async {
          if (_daysMask == 0 || _startMinute >= _endMinute) {
            throw const FormatException(
              'Choose at least one day and an end time after the start time.',
            );
          }
          final result = await _backend().createUser(
            deviceId: _deviceId.text.trim(),
            name: _userName.text.trim(),
            daysMask: _daysMask,
            startMinute: _startMinute,
            endMinute: _endMinute,
            validFrom: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
            validUntil: 0,
          );
          final userId = result['userId']?.toString();
          final keyHex = result['credentialKeyHex']?.toString();
          final schedule = result['schedule'];
          if (userId == null ||
              keyHex == null ||
              schedule is! Map<String, dynamic>) {
            throw const FormatException('Backend returned an invalid credential');
          }
          final credential = <String, Object?>{
            'userId': userId,
            'credentialKeyHex': keyHex,
            'schedule': schedule,
          };
          await _secureStorage.write(
            key: _credentialStorageKey(_deviceId.text.trim()),
            value: jsonEncode(credential),
          );
          setState(() {
            _credentialUserId = userId;
            _status =
                'Credential created and protected in phone storage. Connect and enroll it at the controller.';
          });
        },
      );

  String _credentialStorageKey(String deviceId) =>
      'cl3.credential.' + deviceId;

  Future<Map<String, dynamic>> _loadCredential() async {
    final deviceId = _deviceId.text.trim();
    final raw = await _secureStorage.read(
      key: _credentialStorageKey(deviceId),
    );
    if (raw == null) {
      throw const FormatException(
        'Create a phone credential before enrolling or unlocking.',
      );
    }
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Stored phone credential is invalid');
    }
    _credentialUserId = decoded['userId']?.toString();
    return decoded;
  }

  Future<void> _importCredential() => _runBusy(
        'Importing administrator credential…',
        () async {
          final decoded = jsonDecode(_credentialImport.text.trim());
          if (decoded is! Map<String, dynamic>) {
            throw const FormatException('Paste the credential JSON from the admin page.');
          }
          final userId = decoded['userId']?.toString();
          final keyHex = decoded['credentialKeyHex']?.toString();
          final schedule = decoded['schedule'];
          if (userId == null ||
              keyHex == null ||
              !RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(keyHex) ||
              schedule is! Map<String, dynamic>) {
            throw const FormatException('Administrator credential data is incomplete.');
          }
          uuidToBytes(userId);
          final daysMask = (schedule['daysMask'] as num?)?.toInt() ?? 0;
          final startMinute = (schedule['startMinute'] as num?)?.toInt() ?? -1;
          final endMinute = (schedule['endMinute'] as num?)?.toInt() ?? -1;
          if (daysMask == 0 ||
              daysMask > 127 ||
              startMinute < 0 ||
              startMinute >= endMinute ||
              endMinute > 1440) {
            throw const FormatException('Administrator timetable is invalid.');
          }
          final credential = <String, Object?>{
            'userId': userId,
            'credentialKeyHex': keyHex,
            'schedule': schedule,
          };
          await _secureStorage.write(
            key: _credentialStorageKey(_deviceId.text.trim()),
            value: jsonEncode(credential),
          );
          setState(() {
            _credentialUserId = userId;
            _status = 'Credential imported and protected in phone storage.';
          });
        },
      );

  Future<void> _requestBlePermissions() async {
    if (!Platform.isAndroid) {
      throw const UnsupportedError('This demonstration build targets Android.');
    }
    final androidInfo = await DeviceInfoPlugin().androidInfo;
    final requiredPermissions = androidInfo.version.sdkInt >= 31
        ? <Permission>[
            Permission.bluetoothScan,
            Permission.bluetoothConnect,
          ]
        : <Permission>[Permission.locationWhenInUse];
    final results = await requiredPermissions.request();
    if (requiredPermissions.any((permission) => results[permission]?.isGranted != true)) {
      throw const FormatException(
        'Bluetooth permission is required to find the controller.',
      );
    }
  }

  Future<void> _scanAndConnect() => _runBusy(
        'Scanning for the CL3 controller…',
        () async {
          await _requestBlePermissions();
          if (!await FlutterBluePlus.isSupported) {
            throw const FormatException('Bluetooth LE is not supported here.');
          }
          final targetName = 'CL3-' + _deviceId.text.trim();
          final found = Completer<ScanResult>();
          await _scanSubscription?.cancel();
          _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
            for (final result in results) {
              final advertised =
                  result.advertisementData.advName.isNotEmpty
                      ? result.advertisementData.advName
                      : result.device.platformName;
              if (advertised == targetName && !found.isCompleted) {
                found.complete(result);
              }
            }
          });
          await FlutterBluePlus.startScan(
            withServices: <Guid>[Guid(bleServiceUuid)],
            timeout: const Duration(seconds: 15),
          );
          final result = await found.future.timeout(
            const Duration(seconds: 16),
            onTimeout: () => throw TimeoutException(
              'No controller named $targetName was found.',
            ),
          );
          await FlutterBluePlus.stopScan();
          await _device?.disconnect();
          _device = result.device;
          await _device!.connect(timeout: const Duration(seconds: 15));
          try {
            await _device!.requestMtu(247);
          } catch (_) {
            // The protocol messages also fit the default Android MTU.
          }
          final services = await _device!.discoverServices();
          final service = services.firstWhere(
            (item) => item.serviceUuid == Guid(bleServiceUuid),
            orElse: () => throw const FormatException(
              'Controller BLE service was not found.',
            ),
          );
          _control = service.characteristics.firstWhere(
            (item) => item.characteristicUuid == Guid(bleControlUuid),
            orElse: () =>
                throw const FormatException('Control characteristic missing.'),
          );
          _messages = service.characteristics.firstWhere(
            (item) => item.characteristicUuid == Guid(bleMessageUuid),
            orElse: () =>
                throw const FormatException('Message characteristic missing.'),
          );
          await _messages!.setNotifyValue(true);
          await _messageSubscription?.cancel();
          _messageSubscription = _messages!.onValueReceived.listen(
            _receiveMessage,
          );
          _setStatus('Connected to ' + targetName);
        },
      );

  Future<List<int>> _waitForMessage(int opcode) {
    if (_pendingMessage != null && !_pendingMessage!.isCompleted) {
      throw StateError('A BLE request is already in progress');
    }
    final completer = Completer<List<int>>();
    _pendingOpcode = opcode;
    _pendingMessage = completer;
    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        _pendingOpcode = null;
        _pendingMessage = null;
        throw TimeoutException('Controller response timed out.');
      },
    );
  }

  void _receiveMessage(List<int> bytes) {
    final waiter = _pendingMessage;
    if (bytes.isEmpty ||
        waiter == null ||
        waiter.isCompleted ||
        bytes[0] != _pendingOpcode) {
      return;
    }
    _pendingOpcode = null;
    waiter.complete(List<int>.from(bytes));
  }

  Future<AccessProtocol> _beginSession() async {
    final control = _control;
    if (control == null) {
      throw const FormatException('Connect to the controller first.');
    }
    final phoneKeyPair = await AccessProtocol.newPhoneKeyPair();
    final phonePublic = await AccessProtocol.helloValue(phoneKeyPair);
    final response = _waitForMessage(0x02);
    try {
      await control.write(phonePublic, withoutResponse: false);
    } catch (_) {
      _pendingOpcode = null;
      _pendingMessage = null;
      rethrow;
    }
    final challenge = await response;
    return AccessProtocol.fromChallenge(
      deviceId: _deviceId.text.trim(),
      phoneKeyPair: phoneKeyPair,
      message: challenge,
    );
  }

  Future<List<int>> _sendEncrypted(
    AccessProtocol session,
    List<int> payload,
  ) async {
    final control = _control;
    if (control == null) {
      throw const FormatException('Controller disconnected.');
    }
    final response = _waitForMessage(0x04);
    try {
      final encrypted = await session.encryptPayload(payload);
      await control.write(
        encrypted,
        withoutResponse: false,
        allowLongWrite: true,
      );
      final message = await response;
      return session.decryptResult(message);
    } catch (_) {
      _pendingOpcode = null;
      _pendingMessage = null;
      rethrow;
    }
  }

  Future<void> _enrollPhone() => _runBusy(
        'Enrolling this phone…',
        () async {
          final credential = await _loadCredential();
          final pin = _pairingPin.text.trim();
          final schedule = credential['schedule'] as Map<String, dynamic>;
          final session = await _beginSession();
          if (session.mode != 1) {
            throw const FormatException(
              'Controller is not in physical pairing mode. Hold the exit button and use the PIN shown on the LCD.',
            );
          }
          final payload = enrollmentPayload(
            userId: credential['userId'].toString(),
            credential: hexToBytes(
              credential['credentialKeyHex'].toString(),
            ),
            daysMask: (schedule['daysMask'] as num).toInt(),
            startMinute: (schedule['startMinute'] as num).toInt(),
            endMinute: (schedule['endMinute'] as num).toInt(),
            validFrom: (schedule['validFrom'] as num).toInt(),
            validUntil: schedule['validUntil'] == null
                ? 0
                : (schedule['validUntil'] as num).toInt(),
            pairingPin: pin,
          );
          final result = await _sendEncrypted(session, payload);
          if (result.isEmpty || result[0] != 0x13) {
            throw const FormatException('Controller rejected enrollment.');
          }
          _setStatus('Phone enrolled. BLE unlock works without Wi-Fi.');
        },
      );

  Future<void> _unlock() => _runBusy(
        'Confirm your identity…',
        () async {
          final credential = await _loadCredential();
          final available = await _localAuth.getAvailableBiometrics();
          if (available.isEmpty) {
            throw const FormatException(
              'Set up fingerprint or face unlock on this phone first.',
            );
          }
          final accepted = await _localAuth.authenticate(
            localizedReason: 'Confirm access to the CL3 laboratory',
            biometricOnly: true,
            persistAcrossBackgrounding: true,
          );
          if (!accepted) {
            throw const FormatException('Biometric confirmation cancelled.');
          }
          final session = await _beginSession();
          final userId = credential['userId'].toString();
          final keyBytes = hexToBytes(
            credential['credentialKeyHex'].toString(),
          );
          final proof = await session.proof(
            userId: userId,
            credential: keyBytes,
            operation: 0x01,
          );
          final result = await _sendEncrypted(
            session,
            unlockPayload(userId: userId, proof: proof),
          );
          if (result.isEmpty) {
            throw const FormatException('Controller returned an empty result.');
          }
          switch (result[0]) {
            case 0x10:
              _setStatus('Access granted. The strike unlocks for five seconds.');
              break;
            case 0x11:
              _setStatus('Access denied. Credential is not authorized.');
              break;
            case 0x12:
              _setStatus('Access denied. Outside your permitted timetable.');
              break;
            case 0x16:
              _setStatus('Access denied. Controller clock is not valid.');
              break;
            default:
              _setStatus('Controller denied access.');
              break;
          }
        },
      );

  Future<void> _refreshEvents() => _runBusy(
        'Loading access events…',
        () async {
          final events = await _backend().events(_deviceId.text.trim());
          setState(() {
            _recentEvents = events;
            _status = 'Loaded ' + events.length.toString() + ' recent events.';
          });
        },
      );

  Future<void> _chooseTime({required bool start}) async {
    final selected = await showTimePicker(
      context: context,
      initialTime: start ? _startTime : _endTime,
    );
    if (selected != null) {
      setState(() {
        if (start) {
          _startTime = selected;
        } else {
          _endTime = selected;
        }
      });
    }
  }

  String _formatTime(TimeOfDay value) =>
      value.format(context);

  Widget _section(String title, List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 14),
              ...children,
            ],
          ),
        ),
      );

  Widget _field(
    TextEditingController controller,
    String label, {
    bool obscure = false,
    TextInputType? keyboardType,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: controller,
          obscureText: obscure,
          keyboardType: keyboardType,
          autocorrect: false,
          decoration: InputDecoration(labelText: label),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final connected = _control != null && _messages != null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('CL3 Smart Access'),
        backgroundColor: Theme.of(context).colorScheme.surface,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: <Widget>[
            _section('Controller', <Widget>[
              _field(_deviceId, 'Controller ID'),
              _field(_deviceName, 'Controller name'),
              Text(
                _status,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy ? null : _registerDevice,
                icon: const Icon(Icons.add_link),
                label: const Text('Register controller'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _busy ? null : _scanAndConnect,
                icon: Icon(connected ? Icons.bluetooth_connected : Icons.bluetooth_searching),
                label: Text(connected ? 'Connected' : 'Scan and connect'),
              ),
            ]),
            _section('Phone access', <Widget>[
              Text(
                _credentialUserId == null
                    ? 'No phone credential loaded'
                    : 'Credential: ' + _credentialUserId!,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _busy || !connected ? null : _unlock,
                icon: const Icon(Icons.lock_open),
                label: const Text('Biometric unlock'),
              ),
              const SizedBox(height: 10),
              _field(
                _pairingPin,
                'Pairing PIN shown on controller LCD',
                keyboardType: TextInputType.number,
              ),
              OutlinedButton.icon(
                onPressed: _busy || !connected ? null : _enrollPhone,
                icon: const Icon(Icons.phonelink_lock),
                label: const Text('Enroll this phone'),
              ),
            ]),
            _section('Backend and timetable', <Widget>[
              _field(
                _apiUrl,
                'Backend URL (HTTPS recommended)',
                keyboardType: TextInputType.url,
              ),
              _field(
                _adminToken,
                'Administrator token',
                obscure: true,
              ),
              _field(_userName, 'Student name'),
              Text(
                'Allowed weekdays (Africa/Lusaka)',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 4,
                children: <Widget>[
                  for (var day = 1; day <= 7; day++)
                    FilterChip(
                      label: Text(const <String>[
                        'Mon',
                        'Tue',
                        'Wed',
                        'Thu',
                        'Fri',
                        'Sat',
                        'Sun',
                      ][day - 1]),
                      selected: _selectedDays.contains(day),
                      onSelected: _busy
                          ? null
                          : (selected) => setState(() {
                                if (selected) {
                                  _selectedDays.add(day);
                                } else {
                                  _selectedDays.remove(day);
                                }
                              }),
                    ),
                ],
              ),
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _chooseTime(start: true),
                      child: Text('From ' + _formatTime(_startTime)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _chooseTime(start: false),
                      child: Text('Until ' + _formatTime(_endTime)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _busy ? null : _createCredential,
                icon: const Icon(Icons.person_add_alt_1),
                label: const Text('Create phone credential'),
              ),
              const SizedBox(height: 8),
              _field(
                _credentialImport,
                'Or paste credential JSON from the admin dashboard',
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : _importCredential,
                icon: const Icon(Icons.download_done),
                label: const Text('Import administrator credential'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _busy ? null : _refreshEvents,
                icon: const Icon(Icons.history),
                label: const Text('Refresh audit events'),
              ),
            ]),
            if (_recentEvents.isNotEmpty)
              _section(
                'Recent access events',
                _recentEvents.take(10).map((event) {
                  final kind = event['type']?.toString() ?? 'event';
                  final user = event['userId']?.toString() ?? 'unknown user';
                  final time = event['occurredAt']?.toString() ?? '';
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(Icons.receipt_long),
                    title: Text(kind.replaceAll('_', ' ')),
                    subtitle: Text(user + ' · ' + time),
                  );
                }).toList(),
              ),
            if (_busy) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
