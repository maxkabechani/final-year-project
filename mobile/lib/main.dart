import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:smart_access/mobile_api.dart';
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
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(14)),
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

  String fallbackTitle() {
    final words = deviceId
        .split(RegExp(r'[-_.]+'))
        .where((part) => part.isNotEmpty)
        .map((part) {
          if (part.length <= 2 && int.tryParse(part) != null) return part;
          return '${part[0].toUpperCase()}${part.substring(1)}';
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

  static const _tokenKey = 'smart-access.mobile-token';
  static const _installationKey = 'smart-access.installation-id';
  static const _accessCacheKey = 'smart-access.access-cache';

  final MobileApi _api = MobileApi();
  final Map<String, NearbyDoor> _doors = <String, NearbyDoor>{};

  StreamSubscription<List<ScanResult>>? _scanSubscription;
  StreamSubscription<List<int>>? _messageSubscription;
  BluetoothCharacteristic? _control;
  BluetoothCharacteristic? _messages;
  Completer<List<int>>? _pendingMessage;
  int? _pendingOpcode;
  Timer? _accessTimer;
  Timer? _recentSuccessTimer;

  bool _initializing = true;
  bool _registering = false;
  bool _scanning = false;
  bool _syncing = false;
  String? _mobileToken;
  String? _installationId;
  MobileAccessSnapshot? _access;
  String? _busyDoorId;
  String? _recentlyUnlockedDoorId;

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _messageSubscription?.cancel();
    _accessTimer?.cancel();
    _recentSuccessTimer?.cancel();
    FlutterBluePlus.stopScan();
    _api.close();
    super.dispose();
  }

  Future<void> _initialize() async {
    var installationId = await _secureStorage.read(key: _installationKey);
    if (installationId == null || installationId.isEmpty) {
      installationId = _uuidV4();
      await _secureStorage.write(
        key: _installationKey,
        value: installationId,
      );
    }

    final token = await _secureStorage.read(key: _tokenKey);
    final cached = await _secureStorage.read(key: _accessCacheKey);

    MobileAccessSnapshot? snapshot;
    if (cached != null) {
      try {
        final decoded = jsonDecode(cached);
        if (decoded is Map<String, dynamic>) {
          snapshot = MobileAccessSnapshot.fromJson(decoded);
        }
      } catch (_) {
        await _secureStorage.delete(key: _accessCacheKey);
      }
    }

    if (!mounted) return;
    setState(() {
      _installationId = installationId;
      _mobileToken = token;
      _access = snapshot;
      _initializing = false;
    });

    if (token != null && token.isNotEmpty) {
      await _syncAccess(silent: true);
      _startAccessRefresh();
      await _scan();
    }
  }

  String _uuidV4() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Future<String> _deviceLabel() async {
    try {
      final info = await DeviceInfoPlugin().androidInfo;
      return '${info.manufacturer} ${info.model}'.trim();
    } catch (_) {
      return 'Android phone';
    }
  }

  Future<void> _registerPhone({
    required String fullName,
    required String phoneNumber,
  }) async {
    if (_registering) return;
    final installationId = _installationId;
    if (installationId == null) return;

    setState(() => _registering = true);
    try {
      final registration = await _api.register(
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        installationId: installationId,
        deviceLabel: await _deviceLabel(),
      );

      await _secureStorage.write(
        key: _tokenKey,
        value: registration.mobileToken,
      );

      if (!mounted) return;
      setState(() => _mobileToken = registration.mobileToken);

      await _syncAccess();
      _startAccessRefresh();
      await _scan();
    } catch (error) {
      _showMessage(
        error.toString().replaceFirst('FormatException: ', ''),
        error: true,
      );
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  void _startAccessRefresh() {
    _accessTimer?.cancel();
    _accessTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => unawaited(_syncAccess(silent: true)),
    );
  }

  Future<void> _syncAccess({bool silent = false}) async {
    final token = _mobileToken;
    if (token == null || token.isEmpty || _syncing) return;

    if (mounted) setState(() => _syncing = true);
    try {
      final snapshot = await _api.fetchAccess(token);
      await _secureStorage.write(
        key: _accessCacheKey,
        value: jsonEncode(snapshot.toJson()),
      );
      if (!mounted) return;
      setState(() => _access = snapshot);
    } on MobileApiException catch (error) {
      if (error.statusCode == 401) {
        await _secureStorage.delete(key: _tokenKey);
        await _secureStorage.delete(key: _accessCacheKey);
        _accessTimer?.cancel();
        if (!mounted) return;
        setState(() {
          _mobileToken = null;
          _access = null;
        });
        _showMessage('This phone needs to be registered again.', error: true);
      } else if (!silent) {
        _showMessage(error.message, error: true);
      }
    } catch (_) {
      if (!silent) {
        _showMessage(
          'Could not refresh access. Cached access is still available.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
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

  Future<void> _ensureBluetoothOn() async {
    var state = await FlutterBluePlus.adapterState.first;
    if (state == BluetoothAdapterState.on) return;

    if (!Platform.isAndroid) {
      throw const FormatException('Turn on Bluetooth, then try again.');
    }

    try {
      await FlutterBluePlus.turnOn();
      state = await FlutterBluePlus.adapterState
          .where((value) => value == BluetoothAdapterState.on)
          .first
          .timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw const FormatException('Turn on Bluetooth, then try again.');
    } on PlatformException {
      throw const FormatException('Turn on Bluetooth, then try again.');
    }

    if (state != BluetoothAdapterState.on) {
      throw const FormatException('Turn on Bluetooth, then try again.');
    }
  }

  Future<void> _scan() async {
    if (_scanning || _busyDoorId != null || _mobileToken == null) return;

    try {
      await _requestBlePermissions();
      if (!await FlutterBluePlus.isSupported) {
        throw const FormatException(
          'Bluetooth LE is not supported on this phone.',
        );
      }

      await _ensureBluetoothOn();
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
        if (changed && mounted) setState(() {});
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

  Future<void> _refreshEverything() async {
    await _syncAccess(silent: true);
    await _scan();
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
      orElse: () => throw const FormatException(
        'Door control is unavailable.',
      ),
    );
    _messages = service.characteristics.firstWhere(
      (item) => item.characteristicUuid == Guid(bleMessageUuid),
      orElse: () => throw const FormatException(
        'Door response channel is unavailable.',
      ),
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

    final access = _access;
    final grant = access?.grantFor(door.deviceId);
    if (access == null || grant == null) {
      _showMessage('You do not have access to this door.', error: true);
      return;
    }
    if (!grant.allowsAt(DateTime.now())) {
      _showMessage('Your access is not active at this time.', error: true);
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
        localizedReason: 'Unlock ${grant.deviceName}',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
      if (!accepted) return;

      await _connect(door);

      final session = await _beginSession(door.deviceId);
      uuidToBytes(access.person.personId);
      if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(access.credentialKeyHex)) {
        throw const FormatException('Your phone credential is invalid.');
      }

      final proof = await session.proof(
        userId: access.person.personId,
        credential: hexToBytes(access.credentialKeyHex),
        operation: 0x01,
      );
      final result = await _sendEncrypted(
        session,
        unlockPayload(
          userId: access.person.personId,
          proof: proof,
        ),
      );

      if (result.isEmpty) {
        throw const FormatException('The door returned an empty response.');
      }

      switch (result[0]) {
        case 0x10:
          HapticFeedback.mediumImpact();
          _recentSuccessTimer?.cancel();
          if (mounted) {
            setState(() => _recentlyUnlockedDoorId = door.deviceId);
          }
          _recentSuccessTimer = Timer(const Duration(seconds: 5), () {
            if (mounted) setState(() => _recentlyUnlockedDoorId = null);
          });
          _showMessage('${grant.deviceName} unlocked.', success: true);
          break;
        case 0x11:
          throw const FormatException('You are not authorized for this door.');
        case 0x12:
          throw const FormatException('Your access is not valid at this time.');
        case 0x16:
          throw const FormatException(
            'This door is waiting for its clock to sync.',
          );
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
    if (_initializing) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_mobileToken == null) {
      return RegistrationPage(
        registering: _registering,
        onRegister: _registerPhone,
      );
    }

    final doors = _doors.values.toList()
      ..sort((a, b) => b.rssi.compareTo(a.rssi));

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Smart Access',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: <Widget>[
          if (_syncing)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          IconButton(
            onPressed: _scanning || _busyDoorId != null
                ? null
                : _refreshEverything,
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
        onRefresh: _refreshEverything,
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
                  ? 'Looking for Smart Access locks around you…'
                  : doors.isEmpty
                      ? 'No Smart Access locks are nearby.'
                      : '${doors.length} smart lock${doors.length == 1 ? '' : 's'} nearby',
              style: const TextStyle(
                fontSize: 14,
                color: Colors.black54,
              ),
            ),
            if ((_access?.grants.isEmpty ?? true)) ...<Widget>[
              const SizedBox(height: 16),
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Row(
                    children: <Widget>[
                      Icon(Icons.info_outline_rounded),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Your phone is registered. An administrator has not assigned any doors yet.',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
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
                final grant = _access?.grantFor(door.deviceId);
                final allowedNow = grant?.allowsAt(DateTime.now()) ?? false;
                final busy = _busyDoorId == door.deviceId;
                final justUnlocked = _recentlyUnlockedDoorId == door.deviceId;
                final title = grant?.deviceName.isNotEmpty == true
                    ? grant!.deviceName
                    : door.fallbackTitle();

                String status;
                if (grant == null) {
                  status = 'No access';
                } else if (!allowedNow) {
                  status = 'Outside allowed time';
                } else {
                  status = 'Ready to unlock';
                }

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: busy || !allowedNow ? null : () => _unlock(door),
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
                                    title,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  if (grant?.location.isNotEmpty == true) ...<Widget>[
                                    const SizedBox(height: 2),
                                    Text(
                                      grant!.location,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.black45,
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 5),
                                  Row(
                                    children: <Widget>[
                                      Icon(
                                        _signalIcon(door.rssi),
                                        size: 14,
                                        color: Colors.black45,
                                      ),
                                      const SizedBox(width: 5),
                                      Text(
                                        status,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: allowedNow
                                              ? const Color(0xff166534)
                                              : Colors.black45,
                                          fontWeight: allowedNow
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
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            else
                              Icon(
                                allowedNow
                                    ? Icons.fingerprint_rounded
                                    : Icons.lock_outline_rounded,
                                color: allowedNow
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
                'Tap an authorized door to unlock with your fingerprint or face.',
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

class RegistrationPage extends StatefulWidget {
  const RegistrationPage({
    required this.registering,
    required this.onRegister,
    super.key,
  });

  final bool registering;
  final Future<void> Function({
    required String fullName,
    required String phoneNumber,
  }) onRegister;

  @override
  State<RegistrationPage> createState() => _RegistrationPageState();
}

class _RegistrationPageState extends State<RegistrationPage> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _phoneNumber = TextEditingController();

  @override
  void dispose() {
    _fullName.dispose();
    _phoneNumber.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.onRegister(
      fullName: _fullName.text,
      phoneNumber: _phoneNumber.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Container(
                      width: 56,
                      height: 56,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.lock_open_rounded,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 26),
                    const Text(
                      'Register this phone',
                      style: TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Enter your details once. An administrator will then assign the doors you are allowed to open.',
                      style: TextStyle(
                        height: 1.5,
                        color: Colors.black54,
                      ),
                    ),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _fullName,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      autofillHints: const <String>[AutofillHints.name],
                      decoration: const InputDecoration(
                        labelText: 'Full name',
                        hintText: 'e.g. Max Kabechani',
                      ),
                      validator: (value) {
                        if (value == null || value.trim().length < 2) {
                          return 'Enter your full name';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _phoneNumber,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      autofillHints: const <String>[
                        AutofillHints.telephoneNumber,
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Phone number',
                        hintText: 'e.g. +260 97 1234567',
                      ),
                      validator: (value) {
                        final compact = (value ?? '').replaceAll(
                          RegExp(r'[\s()-]'),
                          '',
                        );
                        if (!RegExp(r'^\+?[0-9]{8,16}$').hasMatch(compact)) {
                          return 'Enter a valid phone number';
                        }
                        return null;
                      },
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: widget.registering ? null : _submit,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                      ),
                      child: widget.registering
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Register phone'),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Registration does not grant door access. Your administrator controls which locks you can open.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: Colors.black45,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
