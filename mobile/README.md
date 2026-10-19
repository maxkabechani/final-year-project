# Smart Access mobile app

The Flutter app handles BLE discovery, secure credential storage, biometric confirmation and offline smart-lock unlock on Android and iOS.

## Production API

The app is built with:

`https://api-project.maxkabechani.dev`

GitHub Actions supplies it through:

```bash
--dart-define=API_BASE_URL=https://api-project.maxkabechani.dev
```

The source contains the same URL as its fallback, so local builds use the deployed API automatically.

## Build locally

### Android

```bash
flutter create --platforms=android --org dev.maxkabechani --project-name smart_access .
python3 tool/prepare_android.py
flutter pub get
flutter run --dart-define=API_BASE_URL=https://api-project.maxkabechani.dev
```

### iOS

iOS 15 or later is required by the current Flutter plugin set. Local iOS builds require macOS and Xcode. The CI workflow creates the iOS project files and applies the Bluetooth and Face ID permission descriptions automatically. The current device-info plugin requires Xcode 26.1.1 or later.

```bash
flutter create --platforms=ios --org dev.maxkabechani --project-name smart_access .
python3 tool/prepare_ios.py
flutter pub get
flutter run --dart-define=API_BASE_URL=https://api-project.maxkabechani.dev
```

GitHub Actions publishes an unsigned `Smart-Access.ipa` for device testing. On iPhone, install AltStore Classic through AltServer, download the IPA, then add it in AltStore. AltServer must be available on the same Wi-Fi network or by USB for sideloading and refresh. Free Apple ID installs expire after 7 days unless refreshed.

## BLE flow

The app scans for controllers named:

`LOCK-<device-id>`

For the default demonstration controller that is:

`LOCK-front-door-01`

The phone stores credentials in platform secure storage. Biometric data never leaves the phone.

For the simplest user flow, create the person/access grant from the web dashboard, copy the generated credential JSON into the app, connect to the matching smart lock, enroll using the pairing PIN, then use **Biometric unlock**.

Administrator-only mobile functions still require the administrator token. Normal imported-credential BLE unlock does not.
