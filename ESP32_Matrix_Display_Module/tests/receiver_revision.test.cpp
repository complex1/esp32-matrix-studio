#include "SerialFrameReceiver.h"
#include <assert.h>
#include <deque>
#include <stdio.h>
#include <string>
#include <vector>

static uint32_t now = 0;
static uint32_t rendered = 0;
uint32_t millis() { return now; }

// Link the real receiver/font against a display stand-in; no hardware is used.
void Matrix::Display::showFrame(const Frame &) { ++rendered; }
int16_t Matrix::Display::showPixel(int16_t x, int16_t y, Color) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return -1;
  ++rendered;
  return y * WIDTH + x;
}
void Matrix::Display::fill(Color) { ++rendered; }
void Matrix::Display::showCorners() { ++rendered; }
bool Matrix::Display::setBrightness(uint8_t brightness) {
  if (brightness < 1 || brightness > MAX_BRIGHTNESS) return false;
  brightness_ = brightness;
  return true;
}

struct FakeStream : Stream {
  std::deque<uint8_t> bytes;
  std::string output;
  int available() override { return static_cast<int>(bytes.size()); }
  int read() override { if (bytes.empty()) return -1; int byte = bytes.front(); bytes.pop_front(); return byte; }
  void print(const char *value) override { output += value; }
  void print(int value) override { output += std::to_string(value); }
  void println(const char *value) override { output += value; output += '\n'; }
  void println(int value) override { output += std::to_string(value); output += '\n'; }
  void feed(const std::string &value) { for (uint8_t byte : value) bytes.push_back(byte); }
  void feed(const std::vector<uint8_t> &value) { for (uint8_t byte : value) bytes.push_back(byte); }
};

static std::vector<uint8_t> packet(uint8_t command, std::vector<uint8_t> payload = {}) {
  std::vector<uint8_t> bytes{'M', 'X', command, static_cast<uint8_t>(payload.size()), static_cast<uint8_t>(payload.size() >> 8)};
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  uint16_t crc = 0xffff;
  for (size_t i = 2; i < bytes.size(); ++i) {
    crc ^= uint16_t(bytes[i]) << 8;
    for (unsigned bit = 0; bit < 8; ++bit) crc = crc & 0x8000 ? uint16_t((crc << 1) ^ 0x1021) : uint16_t(crc << 1);
  }
  bytes.push_back(static_cast<uint8_t>(crc)); bytes.push_back(static_cast<uint8_t>(crc >> 8));
  return bytes;
}

int main() {
  using namespace Matrix;
  FakeStream serial;
  Display display;
  SerialFrameReceiver receiver(serial, display);
  assert(receiver.renderRevision() == 0);

  const char *settings[] = {"COLOR 10 20 30\n", "BG 1 2 3\n", "POS 3 4\n", "FONT 2 1 1\n", "BRIGHTNESS 32\n"};
  for (const auto *setting : settings) { serial.feed(std::string(setting)); receiver.poll(); assert(receiver.renderRevision() == 0); }
  serial.feed(packet('B', {16})); receiver.poll(); assert(receiver.renderRevision() == 0);
  assert(display.brightness() == 16);

  uint32_t expected = 0;
  const char *renders[] = {"TEXT HELLO\r\n", "NUMBER 12:34\n", "PIXEL 19 14 1 2 3\n", "CLEAR\n", "CORNERS\n"};
  for (const auto *render : renders) { serial.feed(std::string(render)); receiver.poll(); assert(receiver.renderRevision() == ++expected); }
  for (const uint8_t command : {'F', 'C', 'K'}) {
    serial.feed(packet(command, command == 'F' ? std::vector<uint8_t>(900, 7) : std::vector<uint8_t>())); receiver.poll(); assert(receiver.renderRevision() == ++expected);
  }
  assert(rendered == expected);

  const char *invalid[] = {"TEXT\n", "NUMBER ABC\n", "PIXEL 20 0\n", "PIXEL 1 1 255 256 255\n", "CLEAR EXTRA\n", "CORNERS EXTRA\n", "FONT 9 0 0\n", "BRIGHTNESS 0\n", "NOT_A_COMMAND\n"};
  for (const auto *command : invalid) { serial.feed(std::string(command)); receiver.poll(); assert(receiver.renderRevision() == expected); }
  serial.feed(std::string(100, 'T') + "\n"); receiver.poll(); assert(receiver.renderRevision() == expected);
  for (const uint8_t command : {'F', 'C', 'K'}) {
    auto corrupt = packet(command, command == 'F' ? std::vector<uint8_t>(900, 7) : std::vector<uint8_t>());
    corrupt.back() ^= 1; serial.feed(corrupt); receiver.poll(); assert(receiver.renderRevision() == expected);
  }
  serial.feed(packet('B', {0})); receiver.poll(); assert(receiver.renderRevision() == expected);
  serial.feed(packet('F', {1, 2, 3})); receiver.poll(); assert(receiver.renderRevision() == expected);
  receiver.resetInput(); assert(receiver.renderRevision() == expected);

  serial.feed(std::string("TEXT INCOMPLETE")); receiver.poll(); assert(receiver.renderRevision() == expected);
  receiver.resetInput(); assert(receiver.renderRevision() == expected);
  serial.feed(std::string("CLEAR\n")); receiver.poll(); assert(receiver.renderRevision() == ++expected);
  assert(rendered == expected);
  assert(serial.output.find("ERR CRC") != std::string::npos);
  assert(serial.output.find("ERR HEADER") != std::string::npos);
  puts("Serial render revisions: validated renders advance; settings, malformed input, CRC failures and reset do not.");
}
