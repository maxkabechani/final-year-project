#pragma once

// Copy this file to config.h, then fill in the values for your controller.
// config.h is ignored by Git so Wi-Fi and device tokens stay out of commits.
#define CL3_DEVICE_ID "cl3-door-01"
#define CL3_WIFI_SSID ""
#define CL3_WIFI_PASSWORD ""
#define CL3_BACKEND_URL "https://your-backend.example"
#define CL3_DEVICE_TOKEN ""

// Paste the trusted root CA certificate for the backend HTTPS host.
// Leave empty to disable network synchronization; BLE unlock continues locally.
#define CL3_BACKEND_ROOT_CA ""

// GPIO map for the 38-pin ESP32-32S board.
#define CL3_PIN_RELAY 33
#define CL3_PIN_DOOR 32
#define CL3_PIN_EXIT 19
#define CL3_PIN_BUZZER 14
#define CL3_PIN_LED_RED 27
#define CL3_PIN_LED_GREEN 26
#define CL3_PIN_LED_BLUE 25
#define CL3_PIN_I2C_SDA 21
#define CL3_PIN_I2C_SCL 22
#define CL3_LCD_ADDRESS 0x27
