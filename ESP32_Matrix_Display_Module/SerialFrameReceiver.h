#pragma once

#include <Arduino.h>
#include "MatrixDisplay.h"
#include "MatrixFont.h"

namespace Matrix {

class SerialFrameReceiver {
 public:
  SerialFrameReceiver(Stream &serial, Display &display)
      : serial_(serial), display_(display) {}

  void poll();
  // Start a fresh transport packet while retaining text/font settings.
  void resetInput() { reset(); }
  // Advances only when a validated command replaces the visible content.
  uint32_t renderRevision() const { return renderRevision_; }

 private:
  enum class State : uint8_t {
    MagicM,
    MagicX,
    Command,
    LengthLow,
    LengthHigh,
    Payload,
    CrcLow,
    CrcHigh,
    AsciiLine,
    AsciiOverflow,
    ResyncM,
    ResyncX
  };

  void accept(uint8_t byte);
  void acceptAscii(uint8_t byte);
  void processLine();
  void updateCrc(uint8_t byte);
  void reset();
  void finish(uint16_t receivedCrc);

  Stream &serial_;
  Display &display_;
  Frame incoming_{};
  FontConfig fontConfig_{};
  State state_ = State::MagicM;
  uint8_t command_ = 0;
  uint16_t length_ = 0;
  uint16_t received_ = 0;
  uint16_t crc_ = 0xFFFF;
  uint8_t crcLow_ = 0;
  uint32_t lastByteAt_ = 0;
  uint32_t renderRevision_ = 0;
  static constexpr uint8_t LINE_CAPACITY = 96;
  char line_[LINE_CAPACITY] = {};
  uint8_t lineSize_ = 0;
};

}  // namespace Matrix
