import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:smart_access/security_protocol.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SmartAccessApp());
}

class SmartAccessApp extends StatelessWidget {
  const SmartAccessApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
      seedColor: Colors.black,
      brightness: Brightness.light,
      primary: Colors.black,
      surface: Colors.white,
    );

    return MaterialApp(
      title: 'Smart Access',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        scaffoldBackgroundColor: const Color(0xfff7f7f7),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xfff7f7f7),
          surfaceTintColor: Colors.transparent,
          elevation: 0,
        ),
        cardTheme: const CardThemeData(
          color: Colors.white,
          margin: EdgeInsets.zero,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(20)),
            side: BorderSide(color: Color(0xffe8e8e8)),
          ),
        ),
      ),
      home: const AccessHomePage(),
    );
  }
}

class NearbyDoor {
  const NearbyDoor({
    required this.deviceId,
    required this.device,
    required this.rssi,
  });

  final String deviceId;
  final BluetoothDevice device;
  final int rssi;

  String get title {
    final words = deviceId
        .split(RegExp(r'[-_.]+'))
        .where((part) => part.isNotEmpty)
        .map((part) {
          if (part.length <= 2 && int.tryParse(part) != null) return part;
          return part[0].toUpperCase() + part.substring(1);
        })
        .toList();
    return words.join(' ');
  }
}

class AccessHomePage extends StatefulWidget {
  const AccessHomePage({super.key});

  @override
  State<AccessHomePage> createState() => _AccessHomePageState();
}

class _AccessHomePageState extends State<AccessHomePage> {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static final LocalAuthentication _localAuth = LocalAuthentication();

  final Map<String, NearbyDoor> _doors = <String, NearbyDoor>{};
  final Map<String, bool> _hasAccess = <String, bool>{};

  StreamSubscription<List<ScanResult>>? _scanSubscription;
  StreamSubscription<List<int>>? _messageSubscription;
  BluetoothCharacteristic? _control;
  BluetoothCharacteristic? _messages;
  Completer<List<int>>? _pendingMessage;
  int? _pendingOpcode;

  bool _scanning = false;
  String? _busyDoorId;
  String? _recentlyUnlockedDoorId;
  Timer? _recentSuccessTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scan());
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _messageSubscription?.cancel();
    _recentSuccessTimer?.cancel();
    FlutterBluePlus.stopScan();
    super.dispose();
  }

  String _credentialStorageKey(String deviceId) =>
      'smart-access.credential.' + deviceId;

  Future<Map<String, dynamic>?> _loadCredential(String deviceId) async {
    final raw = await _secureStorage.read(key: _credentialStorageKey(deviceId));
    if (raw == null) return null;
    final decoded = jsonDecode(raw);
    return decoded is Map<String, dynamic> ? decoded : null;
  }

  Future<void> _refreshAccessState() async {
    final entries = await Future.wait(
      _doors.keys.map((deviceId) async {
        final raw = await _secureStorage.read(
          key: _credentialStorageKey(deviceId),
        );
        return MapEntry(deviceId, raw != null);
      }),
    );
    if (!mounted) return;
    setState(() {
      for (final entry in entries) {
        _hasAccess[entry.key] = entry.value;
      }
    });
  }

  Future<void> _requestBlePermissions() async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('Smart Access currently targets Android.');
    }

    final androidInfo = await DeviceInfoPlugin().androidInfo;
    final requiredPermissions = androidInfo.version.sdkInt >= 31
        ? <Permission>[
            Permission.bluetoothScan,
            Permission.bluetoothConnect,
          ]
        : <Permission>[Permission.locationWhenInUse];

    final results = await requiredPermissions.request();
    if (requiredPermissions.any(
      (permission) => results[permission]?.isGranted != true,
    )) {
      throw const FormatException(
        'Bluetooth permission is required to find nearby doors.',
      );
    }
  }

  Future<void> _scan() async {
    if (_scanning || _busyDoorId != null) return;

    try {
      await _requestBlePermissions();
      if (!await FlutterBluePlus.isSupported) {
        throw const FormatException('Bluetooth LE is not supported on this phone.');
      }

      await FlutterBluePlus.stopScan();
      await _scanSubscription?.cancel();

      if (mounted) {
        setState(() {
          _scanning = true;
          _doors.clear();
        });
      }

      _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
        var changed = false;
        for (final result in results) {
          final advertised = result.advertisementData.advName.isNotEmpty
              ? result.advertisementData.advName
              : result.device.platformName;

          if (!advertised.startsWith('LOCK-')) continue;

          final deviceId = advertised.substring(5);
          if (deviceId.isEmpty) continue;

          _doors[deviceId] = NearbyDoor(
            deviceId: deviceId,
            device: result.device,
            rssi: result.rssi,
          );
          changed = true;
        }

        if (changed && mounted) {
          setState(() {});
          unawaited(_refreshAccessState());
        }
      });

      await FlutterBluePlus.startScan(
        withServices: <Guid>[Guid(bleServiceUuid)],
        timeout: const Duration(seconds: 8),
      );
      await Future<void>.delayed(const Duration(seconds: 8));
    } catch (error) {
      if (mounted) {
        _showMessage(
          error.toString().replaceFirst('FormatException: ', ''),
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _connect(NearbyDoor door) async {
    await FlutterBluePlus.stopScan();
    await door.device.connect(
      license: License.nonprofit,
      timeout: const Duration(seconds: 15),
    );

    try {
      await door.device.requestMtu(247);
    } catch (_) {}

    final services = await door.device.discoverServices();
    final service = services.firstWhere(
      (item) => item.serviceUuid == Guid(bleServiceUuid),
      orElse: () => throw const FormatException(
        'This device is not a Smart Access lock.',
      ),
    );

    _control = service.characteristics.firstWhere(
      (item) => item.characteristicUuid == Guid(bleControlUuid),
      orElse: () => throw const FormatException('Door control is unavailable.'),
    );
    _messages = service.characteristics.firstWhere(
      (item) => item.characteristicUuid == Guid(bleMessageUuid),
      orElse: () => throw const FormatException('Door response channel is unavailable.'),
    );

    await _messages!.setNotifyValue(true);
    await _messageSubscription?.cancel();
    _messageSubscription = _messages!.onValueReceived.listen(_receiveMessage);
  }

  Future<void> _disconnect(BluetoothDevice device) async {
    _control = null;
    _messages = null;
    _pendingOpcode = null;
    final waiter = _pendingMessage;
    if (waiter != null && !waiter.isCompleted) {
      waiter.completeError(StateError('Door disconnected.'));
    }
    _pendingMessage = null;
    await _messageSubscription?.cancel();
    _messageSubscription = null;

    try {
      await device.disconnect();
    } catch (_) {}
  }

  Future<List<int>> _waitForMessage(int opcode) {
    if (_pendingMessage != null && !_pendingMessage!.isCompleted) {
      throw StateError('Another door request is already in progress.');
    }

    final completer = Completer<List<int>>();
    _pendingOpcode = opcode;
    _pendingMessage = completer;

    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        _pendingOpcode = null;
        _pendingMessage = null;
        throw TimeoutException('The door did not respond.');
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
    _pendingMessage = null;
    waiter.complete(List<int>.from(bytes));
  }

  Future<AccessProtocol> _beginSession(String deviceId) async {
    final control = _control;
    if (control == null) {
      throw const FormatException('Door connection was lost.');
    }

    final phoneKeyPair = AccessProtocol.newPhoneKeyPair();
    final response = _waitForMessage(0x02);

    try {
      await control.write(
        AccessProtocol.helloValue(phoneKeyPair),
        withoutResponse: false,
      );
    } catch (_) {
      _pendingOpcode = null;
      _pendingMessage = null;
      rethrow;
    }

    return AccessProtocol.fromChallenge(
      deviceId: deviceId,
      phoneKeyPair: phoneKeyPair,
      message: await response,
    );
  }

  Future<List<int>> _sendEncrypted(
    AccessProtocol session,
    List<int> payload,
  ) async {
    final control = _control;
    if (control == null) {
      throw const FormatException('Door connection was lost.');
    }

    final response = _waitForMessage(0x04);
    try {
      final encrypted = await session.encryptPayload(payload);
      await control.write(
        encrypted,
        withoutResponse: false,
        allowLongWrite: true,
      );
      return await session.decryptResult(await response);
    } catch (_) {
      _pendingOpcode = null;
      _pendingMessage = null;
      rethrow;
    }
  }

  Future<void> _unlock(NearbyDoor door) async {
    if (_busyDoorId != null) return;

    final credential = await _loadCredential(door.deviceId);
    if (credential == null) {
      _showMessage('You do not have access to ' + door.title + '.', error: true);
      return;
    }

    setState(() => _busyDoorId = door.deviceId);

    try {
      final available = await _localAuth.getAvailableBiometrics();
      if (available.isEmpty) {
        throw const FormatException(
          'Set up fingerprint or face unlock on this phone first.',
        );
      }

      final accepted = await _localAuth.authenticate(
        localizedReason: 'Unlock ' + door.title,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
      if (!accepted) return;

      await _connect(door);

      final session = await _beginSession(door.deviceId);
      final userId = credential['userId']?.toString() ?? '';
      final keyHex = credential['credentialKeyHex']?.toString() ?? '';
      uuidToBytes(userId);

      if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(keyHex)) {
        throw const FormatException('Your access on this phone is invalid.');
      }

      final proof = await session.proof(
        userId: userId,
        credential: hexToBytes(keyHex),
        operation: 0x01,
      );
      final result = await _sendEncrypted(
        session,
        unlockPayload(userId: userId, proof: proof),
      );

      if (result.isEmpty) {
        throw const FormatException('The door returned an empty response.');
      }

      switch (result[0]) {
        case 0x10:
          HapticFeedback.mediumImpact();
          _recentSuccessTimer?.cancel();
          setState(() => _recentlyUnlockedDoorId = door.deviceId);
          _recentSuccessTimer = Timer(const Duration(seconds: 5), () {
            if (mounted) setState(() => _recentlyUnlockedDoorId = null);
          });
          _showMessage(door.title + ' unlocked.', success: true);
          break;
        case 0x11:
          throw const FormatException('You are not authorized for this door.');
        case 0x12:
          throw const FormatException('Your access is not valid at this time.');
        case 0x16:
          throw const FormatException('This door is waiting for its clock to sync.');
        default:
          throw const FormatException('Access was denied.');
      }
    } catch (error) {
      _showMessage(
        error.toString().replaceFirst('FormatException: ', ''),
        error: true,
      );
    } finally {
      await _disconnect(door.device);
      if (mounted) setState(() => _busyDoorId = null);
      unawaited(_scan());
    }
  }

  Future<void> _showSetupDialog() async {
    final codeController = TextEditingController();
    final pinController = TextEditingController();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                'Set up access',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              Text(
                'This is only needed once when an administrator gives this phone access.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.black54,
                    ),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: codeController,
                minLines: 3,
                maxLines: 6,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Setup code',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: pinController,
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 6,
                decoration: const InputDecoration(
                  labelText: 'Pairing PIN',
                  border: OutlineInputBorder(),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await _provision(
                    codeController.text.trim(),
                    pinController.text.trim(),
                  );
                },
                child: const Text('Add access to this phone'),
              ),
            ],
          ),
        );
      },
    );

    codeController.dispose();
    pinController.dispose();
  }

  Future<void> _provision(String rawCode, String pin) async {
    if (_busyDoorId != null) return;

    try {
      final decoded = jsonDecode(rawCode);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('The setup code is invalid.');
      }

      final deviceId = decoded['deviceId']?.toString() ?? '';
      final userId = decoded['userId']?.toString() ?? '';
      final keyHex = decoded['credentialKeyHex']?.toString() ?? '';
      final schedule = decoded['schedule'];

      if (deviceId.isEmpty ||
          schedule is! Map<String, dynamic> ||
          !RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(keyHex) ||
          !RegExp(r'^[0-9]{6}$').hasMatch(pin)) {
        throw const FormatException('The setup details are incomplete.');
      }
      uuidToBytes(userId);

      final door = _doors[deviceId];
      if (door == null) {
        throw FormatException(
          'Bring the phone close to LOCK-' + deviceId + ', then refresh and try again.',
        );
      }

      final credential = <String, Object?>{
        'deviceId': deviceId,
        'userId': userId,
        'credentialKeyHex': keyHex,
        'schedule': schedule,
      };

      await _secureStorage.write(
        key: _credentialStorageKey(deviceId),
        value: jsonEncode(credential),
      );
      _hasAccess[deviceId] = true;

      setState(() => _busyDoorId = deviceId);

      await _connect(door);
      final session = await _beginSession(deviceId);
      if (session.mode != 1) {
        throw const FormatException(
          'Restart the smart lock, then set up access within two minutes.',
        );
      }

      final result = await _sendEncrypted(
        session,
        enrollmentPayload(
          userId: userId,
          credential: hexToBytes(keyHex),
          daysMask: (schedule['daysMask'] as num).toInt(),
          startMinute: (schedule['startMinute'] as num).toInt(),
          endMinute: (schedule['endMinute'] as num).toInt(),
          validFrom: (schedule['validFrom'] as num).toInt(),
          validUntil: schedule['validUntil'] == null
              ? 0
              : (schedule['validUntil'] as num).toInt(),
          pairingPin: pin,
        ),
      );

      if (result.isEmpty || result[0] != 0x13) {
        throw const FormatException('The smart lock rejected setup.');
      }

      HapticFeedback.mediumImpact();
      _showMessage(
        'Access added. You can now unlock ' + door.title + '.',
        success: true,
      );
    } catch (error) {
      _showMessage(
        error.toString().replaceFirst('FormatException: ', ''),
        error: true,
      );
    } finally {
      final doorId = _busyDoorId;
      final door = doorId == null ? null : _doors[doorId];
      if (door != null) await _disconnect(door.device);
      if (mounted) setState(() => _busyDoorId = null);
      unawaited(_scan());
    }
  }

  void _showMessage(
    String message, {
    bool error = false,
    bool success = false,
  }) {
    if (!mounted) return;
    final color = success
        ? const Color(0xff166534)
        : error
            ? const Color(0xff991b1b)
            : Colors.black87;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: color,
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  IconData _signalIcon(int rssi) {
    if (rssi >= -60) return Icons.signal_cellular_alt;
    if (rssi >= -75) return Icons.signal_cellular_alt_2_bar;
    return Icons.signal_cellular_alt_1_bar;
  }

  @override
  Widget build(BuildContext context) {
    final doors = _doors.values.toList()
      ..sort((a, b) => b.rssi.compareTo(a.rssi));

    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onLongPress: _showSetupDialog,
          child: const Text(
            'Smart Access',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        actions: <Widget>[
          IconButton(
            onPressed: _scanning || _busyDoorId != null ? null : _scan,
            tooltip: 'Refresh nearby doors',
            icon: _scanning
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _scan,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
          children: <Widget>[
            const Text(
              'Nearby doors',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _scanning
                  ? 'Looking for smart locks around you…'
                  : doors.isEmpty
                      ? 'No smart locks are nearby.'
                      : doors.length.toString() +
                          ' smart lock' +
                          (doors.length == 1 ? '' : 's') +
                          ' nearby',
              style: const TextStyle(
                fontSize: 14,
                color: Colors.black54,
              ),
            ),
            const SizedBox(height: 20),
            if (doors.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 42,
                  ),
                  child: Column(
                    children: <Widget>[
                      const Icon(
                        Icons.door_front_door_outlined,
                        size: 44,
                        color: Colors.black38,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        _scanning ? 'Scanning nearby…' : 'No doors found',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Move closer to a Smart Access door and pull down to refresh.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...doors.map((door) {
                final hasAccess = _hasAccess[door.deviceId] ?? false;
                final busy = _busyDoorId == door.deviceId;
                final justUnlocked = _recentlyUnlockedDoorId == door.deviceId;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: busy ? null : () => _unlock(door),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Row(
                          children: <Widget>[
                            Container(
                              width: 50,
                              height: 50,
                              decoration: BoxDecoration(
                                color: justUnlocked
                                    ? const Color(0xffdcfce7)
                                    : const Color(0xfff1f1f1),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Icon(
                                justUnlocked
                                    ? Icons.lock_open_rounded
                                    : Icons.door_front_door_outlined,
                                color: justUnlocked
                                    ? const Color(0xff15803d)
                                    : Colors.black87,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    door.title,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Row(
                                    children: <Widget>[
                                      Icon(
                                        _signalIcon(door.rssi),
                                        size: 14,
                                        color: Colors.black45,
                                      ),
                                      const SizedBox(width: 5),
                                      Text(
                                        hasAccess
                                            ? 'Ready to unlock'
                                            : 'No access assigned',
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: hasAccess
                                              ? const Color(0xff166534)
                                              : Colors.black45,
                                          fontWeight: hasAccess
                                              ? FontWeight.w600
                                              : FontWeight.w400,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            if (busy)
                              const SizedBox.square(
                                dimension: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            else
                              Icon(
                                hasAccess
                                    ? Icons.fingerprint_rounded
                                    : Icons.lock_outline_rounded,
                                color: hasAccess
                                    ? Colors.black87
                                    : Colors.black26,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            const SizedBox(height: 10),
            const Center(
              child: Text(
                'Tap a door to unlock with your fingerprint or face.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.black45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
