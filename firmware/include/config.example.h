#pragma once

// Copy this file to cl3_local_config.h, then fill in values for your controller.
// cl3_local_config.h is ignored by Git so Wi-Fi and device tokens stay out of commits.
#ifndef CL3_DEVICE_ID
#define CL3_DEVICE_ID "cl3-door-01"
#endif
#ifndef CL3_WIFI_SSID
#define CL3_WIFI_SSID ""
#endif
#ifndef CL3_WIFI_PASSWORD
#define CL3_WIFI_PASSWORD ""
#endif
#ifndef CL3_BACKEND_URL
#define CL3_BACKEND_URL "https://your-backend.example"
#endif
#ifndef CL3_DEVICE_TOKEN
#define CL3_DEVICE_TOKEN ""
#endif

// Paste the trusted root CA certificate for the backend HTTPS host.
// Leave empty to disable network synchronization; BLE unlock continues locally.
#ifndef CL3_BACKEND_ROOT_CA
#define CL3_BACKEND_ROOT_CA ""
#endif

// GPIO map for the 38-pin ESP32-32S board.
#ifndef CL3_PIN_RELAY
#define CL3_PIN_RELAY 33
#endif
#ifndef CL3_PIN_DOOR
#define CL3_PIN_DOOR 32
#endif
#ifndef CL3_PIN_EXIT
#define CL3_PIN_EXIT 19
#endif
#ifndef CL3_PIN_BUZZER
#define CL3_PIN_BUZZER 14
#endif
#ifndef CL3_PIN_LED_RED
#define CL3_PIN_LED_RED 27
#endif
#ifndef CL3_PIN_LED_GREEN
#define CL3_PIN_LED_GREEN 26
#endif
#ifndef CL3_PIN_LED_BLUE
#define CL3_PIN_LED_BLUE 25
#endif
#ifndef CL3_PIN_I2C_SDA
#define CL3_PIN_I2C_SDA 21
#endif
#ifndef CL3_PIN_I2C_SCL
#define CL3_PIN_I2C_SCL 22
#endif
#ifndef CL3_LCD_ADDRESS
#define CL3_LCD_ADDRESS 0x27
#endif
