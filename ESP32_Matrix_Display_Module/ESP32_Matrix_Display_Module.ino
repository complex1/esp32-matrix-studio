#include "MatrixDisplay.h"
#include "SerialFrameReceiver.h"
#include "WiFiControl.h"
#include "ModeEngine.h"

constexpr uint32_t SERIAL_BAUD = 115200;

Matrix::Display display;
Matrix::SerialFrameReceiver receiver(Serial, display);
Matrix::ModeEngine modes(display);
Matrix::WiFiControl wifi(display, modes);

void setup() {
  Serial.setRxBufferSize(2048);
  Serial.begin(SERIAL_BAUD);
  display.begin();

  modes.beginNetworkStatus();
  modes.tick();

  Serial.print("READY 15x20 RGB TEXT PIXEL GPIO");
  Serial.println(static_cast<int>(Matrix::DATA_PIN));
  Serial.println("STUDIO v2 CLOCK TIMER EFFECTS60 TEXT240 FRAMES48");
  Serial.println("BOOT NETWORK IP SUFFIX v1");
  wifi.begin();
}

void loop() {
  // Only a successfully rendered USB command replaces the idle IP screen or
  // autonomous mode. Brightness/font settings and invalid input leave it alone.
  const uint32_t before = receiver.renderRevision();
  receiver.poll();
  if (receiver.renderRevision() != before) modes.stop();
  wifi.poll();
  modes.tick();
  delay(1);
}
