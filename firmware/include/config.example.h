#pragma once

// Copy this file to smart_lock_local_config.h and fill in the deployed values.
// The local config is ignored by Git.
#ifndef SMART_LOCK_DEVICE_ID
#define SMART_LOCK_DEVICE_ID "front-door-01"
#endif
#ifndef SMART_LOCK_WIFI_SSID
#define SMART_LOCK_WIFI_SSID ""
#endif
#ifndef SMART_LOCK_WIFI_PASSWORD
#define SMART_LOCK_WIFI_PASSWORD ""
#endif
#ifndef SMART_LOCK_BACKEND_URL
#define SMART_LOCK_BACKEND_URL "https://your-backend.example"
#endif
#ifndef SMART_LOCK_DEVICE_TOKEN
#define SMART_LOCK_DEVICE_TOKEN ""
#endif

// Six-digit setup PIN used during the automatic pairing window after boot.
// Change this per controller before the final installation.
#ifndef SMART_LOCK_PAIRING_PIN
#define SMART_LOCK_PAIRING_PIN "246810"
#endif

// Optional: paste the trusted root CA certificate for the backend HTTPS host.
// If left empty, the controller still uses HTTPS but skips certificate
// verification. Configure a CA for a production deployment.
#ifndef SMART_LOCK_BACKEND_ROOT_CA
#define SMART_LOCK_BACKEND_ROOT_CA ""
#endif

// Hardware fitted on the final presentation controller.
#ifndef SMART_LOCK_PIN_RELAY
#define SMART_LOCK_PIN_RELAY 33
#endif
// Final relay module is active-high: HIGH energizes the relay, LOW releases it.
#ifndef SMART_LOCK_RELAY_ACTIVE_HIGH
#define SMART_LOCK_RELAY_ACTIVE_HIGH 1
#endif
#ifndef SMART_LOCK_PIN_BUZZER
#define SMART_LOCK_PIN_BUZZER 14
#endif
#ifndef SMART_LOCK_PIN_LED_RED
#define SMART_LOCK_PIN_LED_RED 27
#endif
#ifndef SMART_LOCK_PIN_LED_GREEN
#define SMART_LOCK_PIN_LED_GREEN 26
#endif
#ifndef SMART_LOCK_PIN_LED_BLUE
#define SMART_LOCK_PIN_LED_BLUE 25
#endif
