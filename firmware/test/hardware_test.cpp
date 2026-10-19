#define SMART_ACCESS_HOST_TEST
#include "../SmartAccessLock/SmartAccessLock.ino"
#include <assert.h>
#include <stdio.h>

using namespace SmartAccessHardware;

int main() {
  ExitButton button;
  button.begin(false, 0);
  assert(!button.update(true, 10));
  assert(!button.update(false, 20));
  assert(!button.update(true, 30));
  assert(!button.update(true, 69));
  assert(button.update(true, 70));
  for (uint32_t now = 71; now < 10000; ++now) assert(!button.update(true, now));
  assert(!button.update(false, 10000));
  assert(!button.update(false, 10040));
  assert(!button.update(true, 10050));
  assert(button.update(true, 10090));

  ExitButton heldAtBoot;
  heldAtBoot.begin(true, 0);
  assert(!heldAtBoot.update(true, 1000));
  assert(!heldAtBoot.update(false, 1010));
  assert(!heldAtBoot.update(false, 1050));
  assert(!heldAtBoot.update(true, 1060));
  assert(heldAtBoot.update(true, 1100));

  ExitButton wrappingButton;
  wrappingButton.begin(false, UINT32_MAX - 30);
  assert(!wrappingButton.update(true, UINT32_MAX - 20));
  assert(wrappingButton.update(true, 19));

  RelayPulse relay;
  relay.start(100);
  assert(relay.active());
  assert(!relay.update(5099));
  assert(relay.update(5100));
  assert(!relay.active());
  assert(!relay.update(6000));
  relay.start(UINT32_MAX - 4999); // Deadline is exactly zero after rollover.
  assert(!relay.update(UINT32_MAX));
  assert(relay.update(0));

  // Model an unserviced network/UI loop for ten seconds. Only the independent
  // hardware service polls: exit release and pulse expiry must still happen.
  ExitButton offlineButton;
  RelayPulse offlineRelay;
  offlineButton.begin(false, 0);
  unsigned releases = 0;
  for (uint32_t now = 0; now <= 10000; now += 5) {
    if (offlineButton.update(now >= 100, now)) { offlineRelay.start(now); ++releases; }
    offlineRelay.update(now);
    if (now == 140 || now == 5135) assert(offlineRelay.active());
    if (now >= 5140) assert(!offlineRelay.active());
  }
  assert(releases == 1);

  char text[65], frame[17];
  displayText(text, sizeof(text), "Max Kashela Kabechani");
  displayPage(text, 0, frame);
  assert(strcmp(frame, "Max Kashela Kabe") == 0);
  displayPage(text, 1, frame);
  assert(strcmp(frame, "chani           ") == 0);
  displayPage("Ready", 0, frame);
  assert(strcmp(frame, "Ready           ") == 0); // Erase the previous longer row.
  displayText(text, sizeof(text), "Jos\xc3\xa9\nTest");
  assert(strcmp(text, "Jos? Test") == 0);
  char bounded[5];
  displayText(bounded, sizeof(bounded), "Long username");
  assert(strcmp(bounded, "Long") == 0);
  puts("Exit debounce, held-button, independent relay timing, rollover, and LCD formatting passed.");
}
