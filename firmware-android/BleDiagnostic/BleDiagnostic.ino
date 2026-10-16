#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

static const char *DEVICE_NAME = "LOCK-front-door-01";
static const char *SERVICE_UUID = "9b8e0001-61d0-4f10-9c2a-71f4c05a0001";
static const char *CONTROL_UUID = "9b8e0002-61d0-4f10-9c2a-71f4c05a0001";
static const char *MESSAGE_UUID = "9b8e0003-61d0-4f10-9c2a-71f4c05a0001";

static const int RELAY_PIN = 33;
static const int BUZZER_PIN = 14;
static const int LED_RED = 27;
static const int LED_GREEN = 26;
static const int LED_BLUE = 25;

void setRgb(bool red, bool green, bool blue) {
  digitalWrite(LED_RED, red ? HIGH : LOW);
  digitalWrite(LED_GREEN, green ? HIGH : LOW);
  digitalWrite(LED_BLUE, blue ? HIGH : LOW);
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // active-low relay: OFF

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);

  // Visible/audible proof that setup() is actually running.
  setRgb(false, false, true);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(150);
  digitalWrite(BUZZER_PIN, LOW);

  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(SERVICE_UUID);

  service->createCharacteristic(
    CONTROL_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );

  BLECharacteristic *message = service->createCharacteristic(
    MESSAGE_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  message->setValue("Smart Access BLE diagnostic");

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  // Slow blue blink proves the firmware is still alive.
  static bool blue = true;
  static unsigned long changedAt = 0;

  if (millis() - changedAt >= 1000) {
    changedAt = millis();
    blue = !blue;
    setRgb(false, false, blue);
  }

  delay(10);
}
