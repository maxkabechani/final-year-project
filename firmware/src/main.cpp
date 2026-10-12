#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <RTClib.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <esp_system.h>
#include <mbedtls/ecdh.h>
#include <mbedtls/ecp.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <time.h>
#include <vector>

#if __has_include("../include/cl3_local_config.h")
#include "../include/cl3_local_config.h"
#endif
#include "../include/config.example.h"

static const char *kServiceUuid = "9b8e0001-61d0-4f10-9c2a-71f4c05a0001";
static const char *kControlUuid = "9b8e0002-61d0-4f10-9c2a-71f4c05a0001";
static const char *kMessageUuid = "9b8e0003-61d0-4f10-9c2a-71f4c05a0001";
static const uint8_t kMaxUsers = 48;
static const uint8_t kMaxEvents = 24;
static const uint32_t kPairWindowMs = 120000;
static const uint32_t kSessionWindowMs = 15000;
static const uint32_t kUnlockMs = 5000;
static const size_t kMaxBleMessage = 128;

struct __attribute__((packed)) UserRecord {
  uint8_t userId[16];
  uint8_t credential[32];
  uint8_t daysMask;
  uint16_t startMinute;
  uint16_t endMinute;
  uint32_t validFrom;
  uint32_t validUntil;
};

struct __attribute__((packed)) EventRecord {
  char eventId[37];
  uint32_t timestamp;
  uint8_t type;
  uint8_t userId[16];
  char detail[48];
};

enum EventType : uint8_t {
  EVENT_GRANTED = 1,
  EVENT_DENIED = 2,
  EVENT_EXIT = 3,
  EVENT_DOOR_OPEN = 4,
  EVENT_DOOR_CLOSED = 5,
  EVENT_ENROLLED = 6
};

Preferences preferences;
RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(CL3_LCD_ADDRESS, 16, 2);
NimBLECharacteristic *messageCharacteristic = nullptr;
std::vector<UserRecord> users;
std::vector<EventRecord> events;

portMUX_TYPE bleMux = portMUX_INITIALIZER_UNLOCKED;
uint8_t pendingBleBytes[kMaxBleMessage];
size_t pendingBleLength = 0;
bool pendingBleWrite = false;

mbedtls_ecp_group sessionGroup;
mbedtls_mpi sessionPrivate;
mbedtls_ecp_point sessionPublic;
uint8_t sessionKey[16];
uint8_t sessionNonce[16];
uint8_t phonePublicKey[64];
uint8_t controllerPublicKey[64];
uint32_t sessionCreatedAt = 0;
bool sessionActive = false;
bool sessionConsumed = false;
bool sessionCryptoInitialized = false;

bool rtcFound = false;
bool rtcValid = false;
bool pairingActive = false;
char pairingPin[7] = "000000";
uint32_t pairingExpiresAt = 0;
uint8_t pairingFailures = 0;
bool lockoutActive = false;
uint32_t lockoutExpiresAt = 0;
uint32_t unlockUntil = 0;
uint32_t lastSyncAt = 0;
bool previousDoorOpen = false;
bool doorStateInitialized = false;
bool exitWasDown = false;
bool pairingTriggeredThisPress = false;
uint32_t exitDownAt = 0;

static int secureRandom(void *, unsigned char *output, size_t length) {
  esp_fill_random(output, length);
  return 0;
}

static uint16_t readLe16(const uint8_t *bytes) {
  return static_cast<uint16_t>(bytes[0]) |
         (static_cast<uint16_t>(bytes[1]) << 8);
}

static uint32_t readLe32(const uint8_t *bytes) {
  return static_cast<uint32_t>(bytes[0]) |
         (static_cast<uint32_t>(bytes[1]) << 8) |
         (static_cast<uint32_t>(bytes[2]) << 16) |
         (static_cast<uint32_t>(bytes[3]) << 24);
}

static void appendLe16(std::vector<uint8_t> &out, uint16_t value) {
  out.push_back(static_cast<uint8_t>(value & 0xff));
  out.push_back(static_cast<uint8_t>((value >> 8) & 0xff));
}

static void appendLe32(std::vector<uint8_t> &out, uint32_t value) {
  out.push_back(static_cast<uint8_t>(value & 0xff));
  out.push_back(static_cast<uint8_t>((value >> 8) & 0xff));
  out.push_back(static_cast<uint8_t>((value >> 16) & 0xff));
  out.push_back(static_cast<uint8_t>((value >> 24) & 0xff));
}

static bool constantTimeEqual(const uint8_t *left, const uint8_t *right, size_t length) {
  uint8_t difference = 0;
  for (size_t i = 0; i < length; ++i) {
    difference |= left[i] ^ right[i];
  }
  return difference == 0;
}

static bool hmacSha256(const uint8_t *key, size_t keyLength,
                       const uint8_t *message, size_t messageLength,
                       uint8_t output[32]) {
  const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  return md != nullptr &&
         mbedtls_md_hmac(md, key, keyLength, message, messageLength, output) == 0;
}

static void appendAscii(std::vector<uint8_t> &out, const char *value) {
  while (*value != '\0') out.push_back(static_cast<uint8_t>(*value++));
}

static void appendDeviceId(std::vector<uint8_t> &out) {
  const size_t length = strlen(CL3_DEVICE_ID);
  out.push_back(static_cast<uint8_t>(length));
  out.insert(out.end(), CL3_DEVICE_ID, CL3_DEVICE_ID + length);
}

static std::vector<uint8_t> baseAad() {
  std::vector<uint8_t> aad;
  appendAscii(aad, "CL3-AAD-V1|");
  appendDeviceId(aad);
  aad.insert(aad.end(), sessionNonce, sessionNonce + sizeof(sessionNonce));
  aad.insert(aad.end(), phonePublicKey, phonePublicKey + sizeof(phonePublicKey));
  aad.insert(aad.end(), controllerPublicKey,
             controllerPublicKey + sizeof(controllerPublicKey));
  return aad;
}

static std::vector<uint8_t> hmacTranscript(const uint8_t userId[16], uint8_t operation) {
  std::vector<uint8_t> transcript;
  appendAscii(transcript, "CL3-HMAC-V1|");
  appendDeviceId(transcript);
  transcript.insert(transcript.end(), sessionNonce, sessionNonce + sizeof(sessionNonce));
  transcript.insert(transcript.end(), phonePublicKey, phonePublicKey + sizeof(phonePublicKey));
  transcript.insert(transcript.end(), controllerPublicKey,
                    controllerPublicKey + sizeof(controllerPublicKey));
  transcript.insert(transcript.end(), userId, userId + 16);
  transcript.push_back(operation);
  return transcript;
}

static bool deriveSessionKey(const uint8_t sharedSecret[32]) {
  uint8_t pseudoRandomKey[32];
  if (!hmacSha256(sessionNonce, sizeof(sessionNonce), sharedSecret, 32, pseudoRandomKey)) {
    return false;
  }
  std::vector<uint8_t> info;
  appendAscii(info, "CL3-AES128-V1|");
  appendDeviceId(info);
  info.push_back(1);
  uint8_t expanded[32];
  const bool ok = hmacSha256(pseudoRandomKey, sizeof(pseudoRandomKey),
                             info.data(), info.size(), expanded);
  if (ok) memcpy(sessionKey, expanded, sizeof(sessionKey));
  memset(pseudoRandomKey, 0, sizeof(pseudoRandomKey));
  memset(expanded, 0, sizeof(expanded));
  return ok;
}

static String uuidString(const uint8_t value[16]) {
  char text[37];
  snprintf(text, sizeof(text),
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           value[0], value[1], value[2], value[3], value[4], value[5], value[6],
           value[7], value[8], value[9], value[10], value[11], value[12],
           value[13], value[14], value[15]);
  return String(text);
}

static bool parseUuid(const char *value, uint8_t output[16]) {
  if (value == nullptr || strlen(value) != 36) return false;
  size_t outIndex = 0;
  int high = -1;
  for (size_t i = 0; i < 36; ++i) {
    const char c = value[i];
    if (c == '-') continue;
    uint8_t nibble;
    if (c >= '0' && c <= '9') nibble = static_cast<uint8_t>(c - '0');
    else if (c >= 'a' && c <= 'f') nibble = static_cast<uint8_t>(c - 'a' + 10);
    else if (c >= 'A' && c <= 'F') nibble = static_cast<uint8_t>(c - 'A' + 10);
    else return false;
    if (high < 0) high = nibble;
    else {
      if (outIndex >= 16) return false;
      output[outIndex++] = static_cast<uint8_t>((high << 4) | nibble);
      high = -1;
    }
  }
  return outIndex == 16 && high < 0;
}

static void makeEventId(char output[37]) {
  uint8_t randomBytes[16];
  esp_fill_random(randomBytes, sizeof(randomBytes));
  randomBytes[6] = static_cast<uint8_t>((randomBytes[6] & 0x0f) | 0x40);
  randomBytes[8] = static_cast<uint8_t>((randomBytes[8] & 0x3f) | 0x80);
  String id = uuidString(randomBytes);
  id.toCharArray(output, 37);
}

static const char *eventTypeName(uint8_t type) {
  switch (type) {
    case EVENT_GRANTED: return "granted";
    case EVENT_DENIED: return "denied";
    case EVENT_EXIT: return "exit";
    case EVENT_DOOR_OPEN: return "door_open";
    case EVENT_DOOR_CLOSED: return "door_closed";
    case EVENT_ENROLLED: return "enrolled";
    default: return "denied";
  }
}

static void saveEvents() {
  if (events.empty()) {
    preferences.remove("events");
    return;
  }
  preferences.putBytes("events", events.data(), events.size() * sizeof(EventRecord));
}

static void appendEvent(uint8_t type, const uint8_t *userId, const char *detail) {
  EventRecord event = {};
  makeEventId(event.eventId);
  event.timestamp = rtcFound ? rtc.now().unixtime() : 0;
  event.type = type;
  if (userId != nullptr) memcpy(event.userId, userId, 16);
  if (detail != nullptr) strlcpy(event.detail, detail, sizeof(event.detail));
  events.push_back(event);
  while (events.size() > kMaxEvents) events.erase(events.begin());
  saveEvents();
}

static void loadStoredData() {
  const size_t userBytes = preferences.getBytesLength("users");
  if (userBytes > 0 && userBytes % sizeof(UserRecord) == 0 &&
      userBytes / sizeof(UserRecord) <= kMaxUsers) {
    users.resize(userBytes / sizeof(UserRecord));
    preferences.getBytes("users", users.data(), userBytes);
  }
  const size_t eventBytes = preferences.getBytesLength("events");
  if (eventBytes > 0 && eventBytes % sizeof(EventRecord) == 0 &&
      eventBytes / sizeof(EventRecord) <= kMaxEvents) {
    events.resize(eventBytes / sizeof(EventRecord));
    preferences.getBytes("events", events.data(), eventBytes);
  }
}

static bool saveUsers(const std::vector<UserRecord> &records) {
  if (records.size() > kMaxUsers) return false;
  if (records.empty()) {
    preferences.remove("users");
    users.clear();
    return true;
  }
  const size_t size = records.size() * sizeof(UserRecord);
  if (preferences.putBytes("users", records.data(), size) != size) return false;
  users = records;
  return true;
}

static void setRgb(bool red, bool green, bool blue) {
  digitalWrite(CL3_PIN_LED_RED, red ? HIGH : LOW);
  digitalWrite(CL3_PIN_LED_GREEN, green ? HIGH : LOW);
  digitalWrite(CL3_PIN_LED_BLUE, blue ? HIGH : LOW);
}

static void showMessage(const char *line1, const char *line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

static void beep(uint16_t durationMs = 65) {
  digitalWrite(CL3_PIN_BUZZER, HIGH);
  delay(durationMs);
  digitalWrite(CL3_PIN_BUZZER, LOW);
}

static void unlockDoor(bool exitRequest, const uint8_t *userId = nullptr) {
  digitalWrite(CL3_PIN_RELAY, LOW);
  unlockUntil = millis() + kUnlockMs;
  setRgb(false, true, false);
  beep();
  if (exitRequest) {
    appendEvent(EVENT_EXIT, nullptr, "inside exit button");
    showMessage("Exit requested", "Door unlocked");
  } else {
    appendEvent(EVENT_GRANTED, userId, "access granted");
    showMessage("Access granted", "Door unlocked");
  }
}

static void denyDoor(uint8_t resultCode, const uint8_t *userId, const char *detail) {
  setRgb(true, false, false);
  beep(220);
  appendEvent(EVENT_DENIED, userId, detail);
  if (resultCode == 0x16) showMessage("Access denied", "RTC not valid");
  else if (resultCode == 0x12) showMessage("Access denied", "Outside schedule");
  else showMessage("Access denied", "Not authorized");
}

static bool scheduleAllows(const UserRecord &user, uint32_t utcSeconds) {
  if (!rtcValid || utcSeconds < user.validFrom ||
      (user.validUntil != 0 && utcSeconds >= user.validUntil)) return false;
  const time_t localSeconds = static_cast<time_t>(utcSeconds) + 2 * 60 * 60;
  struct tm localTime;
  if (gmtime_r(&localSeconds, &localTime) == nullptr) return false;
  const uint8_t dayBit = static_cast<uint8_t>(
      1U << (localTime.tm_wday == 0 ? 6 : localTime.tm_wday - 1));
  const uint16_t minute = static_cast<uint16_t>(localTime.tm_hour * 60 + localTime.tm_min);
  return (user.daysMask & dayBit) != 0 &&
         minute >= user.startMinute && minute < user.endMinute;
}

static void notifyBytes(const std::vector<uint8_t> &value) {
  if (messageCharacteristic == nullptr || value.empty()) return;
  messageCharacteristic->setValue(value.data(), value.size());
  messageCharacteristic->notify();
}

static bool createSession(const uint8_t phoneBytes[64]) {
  if (sessionCryptoInitialized) {
    mbedtls_ecp_group_free(&sessionGroup);
    mbedtls_mpi_free(&sessionPrivate);
    mbedtls_ecp_point_free(&sessionPublic);
  }
  mbedtls_ecp_group_init(&sessionGroup);
  mbedtls_mpi_init(&sessionPrivate);
  mbedtls_ecp_point_init(&sessionPublic);
  sessionCryptoInitialized = true;
  sessionActive = false;
  memset(sessionKey, 0, sizeof(sessionKey));

  uint8_t encodedPhone[65];
  encodedPhone[0] = 0x04;
  memcpy(encodedPhone + 1, phoneBytes, 64);
  mbedtls_ecp_point phonePoint;
  mbedtls_ecp_point_init(&phonePoint);
  uint8_t sharedSecret[32];
  size_t publicLength = 0;
  uint8_t encodedController[65];
  bool ok = mbedtls_ecp_group_load(&sessionGroup, MBEDTLS_ECP_DP_SECP256R1) == 0 &&
            mbedtls_ecp_gen_keypair(&sessionGroup, &sessionPrivate, &sessionPublic,
                                    secureRandom, nullptr) == 0 &&
            mbedtls_ecp_point_read_binary(&sessionGroup, &phonePoint,
                                          encodedPhone, sizeof(encodedPhone)) == 0;
  if (ok) {
    mbedtls_mpi sharedX;
    mbedtls_mpi_init(&sharedX);
    ok = mbedtls_ecdh_compute_shared(&sessionGroup, &sharedX, &phonePoint,
                                     &sessionPrivate, secureRandom, nullptr) == 0 &&
         mbedtls_mpi_write_binary(&sharedX, sharedSecret, sizeof(sharedSecret)) == 0;
    mbedtls_mpi_free(&sharedX);
  }
  if (ok) {
    ok = mbedtls_ecp_point_write_binary(&sessionGroup, &sessionPublic,
                                        MBEDTLS_ECP_PF_UNCOMPRESSED,
                                        &publicLength, encodedController,
                                        sizeof(encodedController)) == 0 &&
         publicLength == sizeof(encodedController);
  }
  if (ok) {
    memcpy(phonePublicKey, phoneBytes, 64);
    memcpy(controllerPublicKey, encodedController + 1, 64);
    esp_fill_random(sessionNonce, sizeof(sessionNonce));
    ok = deriveSessionKey(sharedSecret);
  }
  memset(sharedSecret, 0, sizeof(sharedSecret));
  mbedtls_ecp_point_free(&phonePoint);
  if (!ok) {
    sessionActive = false;
    return false;
  }
  sessionCreatedAt = millis();
  sessionConsumed = false;
  sessionActive = true;
  return true;
}

static void handleHello(const uint8_t *value, size_t length) {
  if (length != 65 || value[0] != 0x01 || !createSession(value + 1)) {
    sessionActive = false;
    return;
  }
  std::vector<uint8_t> challenge;
  challenge.reserve(82);
  challenge.push_back(0x02);
  challenge.insert(challenge.end(), sessionNonce, sessionNonce + sizeof(sessionNonce));
  challenge.insert(challenge.end(), controllerPublicKey,
                   controllerPublicKey + sizeof(controllerPublicKey));
  const bool pairingWindow = pairingActive && !lockoutActive &&
                             static_cast<int32_t>(pairingExpiresAt - millis()) > 0;
  challenge.push_back(pairingWindow ? 0x01 : 0x00);
  notifyBytes(challenge);
}

static bool decryptPayload(const uint8_t *value, size_t length,
                           std::vector<uint8_t> &plaintext) {
  if (!sessionActive || sessionConsumed ||
      static_cast<int32_t>(millis() - sessionCreatedAt) >
          static_cast<int32_t>(kSessionWindowMs) ||
      length < 29 || value[0] != 0x03) return false;
  sessionConsumed = true;
  const size_t ciphertextLength = length - 29;
  const uint8_t *nonce = value + 1;
  const uint8_t *ciphertext = value + 13;
  const uint8_t *tag = value + length - 16;
  plaintext.resize(ciphertextLength);
  const std::vector<uint8_t> aad = baseAad();
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  bool ok = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES,
                               sessionKey, 128) == 0 &&
            mbedtls_gcm_auth_decrypt(&gcm, ciphertextLength,
                                     nonce, 12,
                                     aad.data(), aad.size(),
                                     tag, 16,
                                     ciphertext, plaintext.data()) == 0;
  mbedtls_gcm_free(&gcm);
  if (!ok) plaintext.clear();
  return ok;
}

static void sendEncryptedResult(uint8_t resultCode) {
  std::vector<uint8_t> aad = baseAad();
  appendAscii(aad, "CL3-RESULT");
  uint8_t nonce[12];
  uint8_t tag[16];
  esp_fill_random(nonce, sizeof(nonce));
  uint8_t ciphertext[1];
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  bool ok = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, sessionKey, 128) == 0 &&
            mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT, 1,
                                      nonce, sizeof(nonce),
                                      aad.data(), aad.size(),
                                      &resultCode, ciphertext,
                                      sizeof(tag), tag) == 0;
  mbedtls_gcm_free(&gcm);
  if (!ok) return;
  std::vector<uint8_t> response;
  response.reserve(30);
  response.push_back(0x04);
  response.insert(response.end(), nonce, nonce + sizeof(nonce));
  response.push_back(ciphertext[0]);
  response.insert(response.end(), tag, tag + sizeof(tag));
  notifyBytes(response);
}

static UserRecord *findUser(const uint8_t userId[16]) {
  for (UserRecord &user : users) {
    if (constantTimeEqual(user.userId, userId, 16)) return &user;
  }
  return nullptr;
}

static void handleEnrollment(const std::vector<uint8_t> &payload) {
  if (!pairingActive || lockoutActive ||
      static_cast<int32_t>(pairingExpiresAt - millis()) <= 0 ||
      payload.size() != 69 || payload[0] != 0x02) {
    denyDoor(0x14, nullptr, "pairing window closed");
    sendEncryptedResult(0x14);
    return;
  }
  if (memcmp(payload.data() + 62, pairingPin, 6) != 0) {
    ++pairingFailures;
    if (pairingFailures >= 5) {
      lockoutActive = true;
      lockoutExpiresAt = millis() + 30000;
      pairingActive = false;
    }
    showMessage("Pairing denied", "Check PIN");
    sendEncryptedResult(0x14);
    return;
  }
  if (payload[68] != 0) {
    sendEncryptedResult(0x14);
    return;
  }
  UserRecord incoming = {};
  memcpy(incoming.userId, payload.data() + 1, 16);
  memcpy(incoming.credential, payload.data() + 17, 32);
  incoming.daysMask = payload[49] & 0x7f;
  incoming.startMinute = readLe16(payload.data() + 50);
  incoming.endMinute = readLe16(payload.data() + 52);
  incoming.validFrom = readLe32(payload.data() + 54);
  incoming.validUntil = readLe32(payload.data() + 58);
  if (incoming.daysMask == 0 || incoming.startMinute >= incoming.endMinute ||
      incoming.endMinute > 1440) {
    sendEncryptedResult(0x14);
    return;
  }
  std::vector<UserRecord> updated = users;
  UserRecord *existing = nullptr;
  for (UserRecord &user : updated) {
    if (constantTimeEqual(user.userId, incoming.userId, 16)) {
      existing = &user;
      break;
    }
  }
  if (existing != nullptr) *existing = incoming;
  else if (updated.size() < kMaxUsers) updated.push_back(incoming);
  else {
    showMessage("Pairing failed", "User list full");
    sendEncryptedResult(0x14);
    return;
  }
  if (!saveUsers(updated)) {
    showMessage("Pairing failed", "Storage error");
    sendEncryptedResult(0x14);
    return;
  }
  if (!rtcValid && incoming.validFrom >= 1700000000U) {
    rtc.adjust(DateTime(incoming.validFrom));
    rtcValid = true;
  }
  pairingActive = false;
  appendEvent(EVENT_ENROLLED, incoming.userId, "phone credential enrolled");
  showMessage("Phone enrolled", "Access is ready");
  setRgb(false, false, true);
  beep(110);
  sendEncryptedResult(0x13);
}

static void handleUnlock(const std::vector<uint8_t> &payload) {
  if (payload.size() != 49 || payload[0] != 0x01) {
    denyDoor(0x11, nullptr, "invalid request");
    sendEncryptedResult(0x11);
    return;
  }
  const uint8_t *userId = payload.data() + 1;
  UserRecord *user = findUser(userId);
  if (user == nullptr) {
    denyDoor(0x11, userId, "unknown credential");
    sendEncryptedResult(0x11);
    return;
  }
  const std::vector<uint8_t> transcript = hmacTranscript(userId, 0x01);
  uint8_t expectedProof[32];
  const bool proofValid = hmacSha256(user->credential, sizeof(user->credential),
                                     transcript.data(), transcript.size(),
                                     expectedProof) &&
                          constantTimeEqual(expectedProof, payload.data() + 17, 32);
  memset(expectedProof, 0, sizeof(expectedProof));
  if (!proofValid) {
    denyDoor(0x11, userId, "invalid credential proof");
    sendEncryptedResult(0x11);
    return;
  }
  const uint32_t now = rtcFound ? rtc.now().unixtime() : 0;
  if (!rtcValid) {
    denyDoor(0x16, userId, "RTC invalid");
    sendEncryptedResult(0x16);
    return;
  }
  if (!scheduleAllows(*user, now)) {
    denyDoor(0x12, userId, "outside timetable");
    sendEncryptedResult(0x12);
    return;
  }
  unlockDoor(false, userId);
  sendEncryptedResult(0x10);
}

static void processEncryptedMessage(const uint8_t *value, size_t length) {
  std::vector<uint8_t> plaintext;
  if (!decryptPayload(value, length, plaintext)) {
    sessionActive = false;
    return;
  }
  if (plaintext.empty()) {
    sendEncryptedResult(0x11);
    return;
  }
  if (plaintext[0] == 0x01) handleUnlock(plaintext);
  else if (plaintext[0] == 0x02) handleEnrollment(plaintext);
  else {
    denyDoor(0x11, nullptr, "unsupported request");
    sendEncryptedResult(0x11);
  }
  sessionActive = false;
}

class ControlCallbacks : public NimBLECharacteristicCallbacks {
 public:
  void onWrite(NimBLECharacteristic *characteristic,
               NimBLEConnInfo &connectionInfo) override {
    (void)connectionInfo;
    const std::string value = characteristic->getValue();
    if (value.empty() || value.size() > kMaxBleMessage) return;
    portENTER_CRITICAL(&bleMux);
    memcpy(pendingBleBytes, value.data(), value.size());
    pendingBleLength = value.size();
    pendingBleWrite = true;
    portEXIT_CRITICAL(&bleMux);
  }
};

static void setupBle() {
  String advertisedName = "CL3-" + String(CL3_DEVICE_ID);
  if (advertisedName.length() > 24) advertisedName.remove(24);
  NimBLEDevice::init(advertisedName.c_str());
  NimBLEDevice::setMTU(247);
  NimBLEServer *server = NimBLEDevice::createServer();
  NimBLEService *service = server->createService(kServiceUuid);
  NimBLECharacteristic *control = service->createCharacteristic(
      kControlUuid, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  messageCharacteristic = service->createCharacteristic(
      kMessageUuid, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  control->setCallbacks(new ControlCallbacks());
  service->start();
  NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(kServiceUuid);
  advertising->start();
}

static String backendRoot(const char *path) {
  String root = CL3_BACKEND_URL;
  while (root.endsWith("/")) root.remove(root.length() - 1);
  return root + path;
}

static bool backendReady() {
  return strlen(CL3_BACKEND_URL) > 8 &&
         strlen(CL3_DEVICE_TOKEN) > 16 &&
         strlen(CL3_BACKEND_ROOT_CA) > 100 &&
         WiFi.status() == WL_CONNECTED;
}

static bool secureGet(const String &url, String &body) {
  WiFiClientSecure client;
  client.setCACert(CL3_BACKEND_ROOT_CA);
  HTTPClient http;
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", "Bearer " + String(CL3_DEVICE_TOKEN));
  const int status = http.GET();
  if (status >= 200 && status < 300) body = http.getString();
  http.end();
  return status >= 200 && status < 300;
}

static bool securePost(const String &url, const String &body) {
  WiFiClientSecure client;
  client.setCACert(CL3_BACKEND_ROOT_CA);
  HTTPClient http;
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", "Bearer " + String(CL3_DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(body);
  http.end();
  return status >= 200 && status < 300;
}

static bool syncClock() {
  String body;
  const String path = "/api/devices/" + String(CL3_DEVICE_ID) + "/time";
  if (!secureGet(backendRoot(path.c_str()), body)) return false;
  JsonDocument document;
  if (deserializeJson(document, body) != DeserializationError::Ok) return false;
  const uint32_t unixSeconds = document["unixSeconds"] | 0U;
  if (unixSeconds < 1700000000U) return false;
  rtc.adjust(DateTime(unixSeconds));
  rtcValid = true;
  return true;
}

static bool syncUsers() {
  String body;
  const String path = "/api/devices/" + String(CL3_DEVICE_ID) + "/sync";
  if (!secureGet(backendRoot(path.c_str()), body)) return false;
  JsonDocument document;
  if (deserializeJson(document, body) != DeserializationError::Ok) return false;
  JsonArray array = document["users"].as<JsonArray>();
  if (array.isNull() || array.size() > kMaxUsers) return false;
  std::vector<UserRecord> updated;
  updated.reserve(array.size());
  for (JsonObject item : array) {
    UserRecord user = {};
    if (!parseUuid(item["userId"] | "", user.userId)) return false;
    const char *key = item["credentialKeyHex"] | "";
    if (strlen(key) != 64) return false;
    for (size_t i = 0; i < 32; ++i) {
      char byteText[3] = {key[i * 2], key[i * 2 + 1], '\0'};
      char *end = nullptr;
      const long parsed = strtol(byteText, &end, 16);
      if (end == byteText || *end != '\0') return false;
      user.credential[i] = static_cast<uint8_t>(parsed);
    }
    JsonObject schedule = item["schedule"].as<JsonObject>();
    user.daysMask = schedule["daysMask"] | 0;
    user.startMinute = schedule["startMinute"] | 0;
    user.endMinute = schedule["endMinute"] | 0;
    user.validFrom = schedule["validFrom"] | 0U;
    user.validUntil = schedule["validUntil"].isNull()
                          ? 0U
                          : schedule["validUntil"].as<uint32_t>();
    if (user.daysMask == 0 || user.startMinute >= user.endMinute ||
        user.endMinute > 1440) return false;
    updated.push_back(user);
  }
  return saveUsers(updated);
}

static void formatIsoUtc(uint32_t timestamp, char output[21]) {
  const DateTime dateTime(timestamp);
  snprintf(output, 21, "%04u-%02u-%02uT%02u:%02u:%02uZ",
           dateTime.year(), dateTime.month(), dateTime.day(),
           dateTime.hour(), dateTime.minute(), dateTime.second());
}

static bool syncEvents() {
  if (events.empty()) return true;
  JsonDocument document;
  JsonArray array = document["events"].to<JsonArray>();
  for (const EventRecord &event : events) {
    JsonObject item = array.add<JsonObject>();
    item["eventId"] = event.eventId;
    char isoTime[21];
    formatIsoUtc(event.timestamp, isoTime);
    item["occurredAt"] = isoTime;
    item["type"] = eventTypeName(event.type);
    bool hasUser = false;
    for (uint8_t byte : event.userId) hasUser = hasUser || byte != 0;
    if (hasUser) item["userId"] = uuidString(event.userId);
    else item["userId"] = nullptr;
    item["detail"] = event.detail;
  }
  String body;
  serializeJson(document, body);
  const String path = "/api/devices/" + String(CL3_DEVICE_ID) + "/events";
  if (!securePost(backendRoot(path.c_str()), body)) return false;
  events.clear();
  saveEvents();
  return true;
}

static void syncBackend() {
  if (!backendReady()) return;
  const bool timeSynced = syncClock();
  const bool usersSynced = syncUsers();
  const bool eventsSynced = syncEvents();
  if (timeSynced || usersSynced || eventsSynced) {
    Serial.printf("Backend sync: time=%d users=%d events=%d\n",
                  timeSynced, usersSynced, eventsSynced);
  }
}

static void startPairingWindow() {
  if (lockoutActive) return;
  esp_fill_random(pairingPin, 6);
  for (uint8_t i = 0; i < 6; ++i) pairingPin[i] = '0' + (pairingPin[i] % 10);
  pairingPin[6] = '\0';
  pairingActive = true;
  pairingFailures = 0;
  pairingExpiresAt = millis() + kPairWindowMs;
  char firstLine[17];
  snprintf(firstLine, sizeof(firstLine), "Pair PIN %s", pairingPin);
  showMessage(firstLine, "Valid for 120 sec");
  setRgb(false, false, true);
  beep(120);
}

static void handleExitButton() {
  const bool isDown = digitalRead(CL3_PIN_EXIT) == LOW;
  if (isDown && !exitWasDown) {
    exitDownAt = millis();
    pairingTriggeredThisPress = false;
    unlockDoor(true);
  }
  if (isDown && !pairingTriggeredThisPress &&
      static_cast<uint32_t>(millis() - exitDownAt) >= 5000) {
    pairingTriggeredThisPress = true;
    startPairingWindow();
  }
  if (!isDown && exitWasDown) {
    pairingTriggeredThisPress = false;
  }
  exitWasDown = isDown;
}

static void handleDoorContact() {
  const bool doorOpen = digitalRead(CL3_PIN_DOOR) == HIGH;
  if (!doorStateInitialized) {
    previousDoorOpen = doorOpen;
    doorStateInitialized = true;
    return;
  }
  if (doorOpen != previousDoorOpen) {
    previousDoorOpen = doorOpen;
    appendEvent(doorOpen ? EVENT_DOOR_OPEN : EVENT_DOOR_CLOSED,
                nullptr, doorOpen ? "door contact opened" : "door contact closed");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CL3_PIN_RELAY, OUTPUT);
  digitalWrite(CL3_PIN_RELAY, HIGH);
  pinMode(CL3_PIN_DOOR, INPUT_PULLUP);
  pinMode(CL3_PIN_EXIT, INPUT_PULLUP);
  pinMode(CL3_PIN_BUZZER, OUTPUT);
  digitalWrite(CL3_PIN_BUZZER, LOW);
  pinMode(CL3_PIN_LED_RED, OUTPUT);
  pinMode(CL3_PIN_LED_GREEN, OUTPUT);
  pinMode(CL3_PIN_LED_BLUE, OUTPUT);
  setRgb(false, false, true);

  Wire.begin(CL3_PIN_I2C_SDA, CL3_PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();
  showMessage("CL3 Smart Door", "Starting...");

  preferences.begin("cl3-access", false);
  loadStoredData();
  rtcFound = rtc.begin();
  if (rtcFound) {
    rtcValid = !rtc.lostPower();
    if (!rtcValid) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      Serial.println("RTC was reset; waiting for authenticated server time.");
    }
  }

  if (strlen(CL3_WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(CL3_WIFI_SSID, CL3_WIFI_PASSWORD);
  }

  setupBle();
  showMessage("BLE ready", rtcValid ? "Offline access ready" : "Waiting for time");
  Serial.printf("Controller %s ready with %u users.\n",
                CL3_DEVICE_ID, static_cast<unsigned>(users.size()));
  if (WiFi.status() == WL_CONNECTED) syncBackend();
}

void loop() {
  uint8_t localMessage[kMaxBleMessage];
  size_t localLength = 0;
  portENTER_CRITICAL(&bleMux);
  if (pendingBleWrite) {
    localLength = pendingBleLength;
    memcpy(localMessage, pendingBleBytes, localLength);
    pendingBleWrite = false;
  }
  portEXIT_CRITICAL(&bleMux);
  if (localLength > 0) {
    if (localMessage[0] == 0x01) handleHello(localMessage, localLength);
    else if (localMessage[0] == 0x03) processEncryptedMessage(localMessage, localLength);
  }

  handleExitButton();
  handleDoorContact();
  if (unlockUntil != 0 && static_cast<int32_t>(millis() - unlockUntil) >= 0) {
    digitalWrite(CL3_PIN_RELAY, HIGH);
    unlockUntil = 0;
    setRgb(false, false, true);
    showMessage("CL3 Smart Door", rtcValid ? "Ready" : "Clock not set");
  }
  if (pairingActive && static_cast<int32_t>(millis() - pairingExpiresAt) >= 0) {
    pairingActive = false;
    pairingPin[0] = '\0';
    showMessage("Pairing ended", "Access still local");
  }
  if (lockoutActive && static_cast<int32_t>(millis() - lockoutExpiresAt) >= 0) {
    lockoutActive = false;
    pairingFailures = 0;
  }
  if (WiFi.status() == WL_CONNECTED &&
      static_cast<uint32_t>(millis() - lastSyncAt) >= 60000) {
    lastSyncAt = millis();
    syncBackend();
  }
  delay(8);
}
