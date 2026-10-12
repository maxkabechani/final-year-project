# Flutter mobile app

The Android app uses FlutterBluePlus for BLE GATT, local_auth for the on-device biometric prompt, cryptography for P-256 ECDH/HKDF/HMAC/AES-GCM, and flutter_secure_storage for the user's credential. The biometric stays on the phone; no fingerprint or face data is sent to the controller or API.

## Generate Android files and run

Install the stable Flutter SDK and Java 17. From this directory run:

1. flutter create --platforms=android --org zm.ac.unza --project-name cl3_access .
2. python3 tool/prepare_android.py
3. flutter pub get
4. flutter run

The project intentionally keeps generated Gradle wrapper and Android template files out of the source tree. GitHub Actions creates the Android platform files before building the APK.

The Android preparation script also changes MainActivity to FlutterFragmentActivity, which is required by the biometric plugin.

The generated debug build allows HTTP for a controller demo on a trusted, isolated lab network. Admin tokens and new credentials are exposed to that network when HTTP is used. Use an HTTPS backend for any shared or public network, and set the ESP32 root CA before enabling backend synchronization.

## First controller setup

Enter the deployed backend URL and administrator bearer token. Register a controller and install the returned device token and device ID in the firmware configuration. Create a user with their allowed weekdays and local access interval. The app stores the returned credential in Android secure storage.

An administrator can also create a user in the web dashboard, copy the resulting credential JSON, and import it in the app. Hold the controller exit button for five seconds to start physical pairing. The RTC can initialize during this first enrollment from the phone's provisioning time if no trusted backend time sync is configured.

Hold the controller's exit button for five seconds. It continues to provide the normal inside exit action and then displays a one-time pairing PIN on the LCD. Scan for the CL3 controller, enter the displayed PIN, and enroll the phone. The user can then unlock offline; timetable checks happen on the ESP32 against its DS3231 clock.

## Verification

flutter analyze and flutter test are run in GitHub Actions. BLE and biometric operation still requires a physical Android phone and the ESP32 controller; the CI build cannot verify hardware behavior.
