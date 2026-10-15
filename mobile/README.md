# Smart Access Android app

The Flutter Android app handles BLE discovery, secure credential storage, biometric confirmation and offline smart-lock unlock.

## Production API

The app is built with:

`https://api-project.maxkabechani.dev`

GitHub Actions supplies it through:

```bash
--dart-define=API_BASE_URL=https://api-project.maxkabechani.dev
```

The source contains the same URL as its fallback, so local builds use the deployed API automatically.

## Build locally

```bash
flutter create --platforms=android --org dev.maxkabechani --project-name smart_access .
python3 tool/prepare_android.py
flutter pub get
flutter run --dart-define=API_BASE_URL=https://api-project.maxkabechani.dev
```

## BLE flow

The app scans for controllers named:

`LOCK-<device-id>`

For the default demonstration controller that is:

`LOCK-front-door-01`

The phone stores credentials in Android secure storage. Biometric data never leaves the phone.

For the simplest user flow, create the person/access grant from the web dashboard, copy the generated credential JSON into the Android app, connect to the matching smart lock, enroll using the pairing PIN, then use **Biometric unlock**.

Administrator-only mobile functions still require the administrator token. Normal imported-credential BLE unlock does not.
