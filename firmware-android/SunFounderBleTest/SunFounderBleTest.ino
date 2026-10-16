/*
  SunFounder-style BLE visibility test for ESP32.

  Structure follows SunFounder's ESP32 Starter Kit "7.1 Bluetooth" example:
  BLEDevice -> BLEServer -> BLEService -> RX/TX characteristics ->
  BLE2902 descriptor -> pServer->getAdvertising()->start().

  This test deliberately uses the ESP32 Arduino core BLE library, NOT NimBLE-Arduino.
*/

#include "BLEDevice.h"
#include "BLEServer.h"
#include "BLEUtils.h"
#include "BLE2902.h"

const char *bleName = "ESP32_Bluetooth";

#define SERVICE_UUID "15d738e4-ed6e-11ed-a05b-0242ac120003"
#define CHARACTERISTIC_UUID_RX "06015e54-ed6e-11ed-a05b-0242ac120003"
#define CHARACTERISTIC_UUID_TX "0e8b42ba-ed6e-11ed-a05b-0242ac120003"

BLECharacteristic *pTxCharacteristic = nullptr;
String receivedText = "";

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    Serial.println("Connected");
  }

  void onDisconnect(BLEServer *pServer) {
    Serial.println("Disconnected");
    pServer->getAdvertising()->start();
  }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    std::string value = std::string(pCharacteristic->getValue().c_str());
    receivedText = String(value.c_str());
    Serial.print("Received: ");
    Serial.println(receivedText);
  }
};

void setupBLE() {
  BLEDevice::init(bleName);

  BLEServer *pServer = BLEDevice::createServer();
  if (pServer == nullptr) {
    Serial.println("Error creating BLE server");
    return;
  }

  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  if (pService == nullptr) {
    Serial.println("Error creating BLE service");
    return;
  }

  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE
  );
  pRxCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  pService->start();
  pServer->getAdvertising()->start();

  Serial.println("Waiting for a client connection...");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  setupBLE();
}

void loop() {
  if (receivedText.length() > 0) {
    pTxCharacteristic->setValue(receivedText.c_str());
    pTxCharacteristic->notify();
    receivedText = "";
  }

  delay(20);
}
