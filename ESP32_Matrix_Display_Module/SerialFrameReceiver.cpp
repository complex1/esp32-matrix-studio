#include "SerialFrameReceiver.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

namespace Matrix {

namespace {
constexpr uint32_t PACKET_TIMEOUT_MS = 1000;

void skipSpaces(const char *&cursor) {
  while (isspace(static_cast<unsigned char>(*cursor))) ++cursor;
}

bool readInt(const char *&cursor, int32_t minimum, int32_t maximum,
             int32_t &result) {
  skipSpaces(cursor);
  if (*cursor == '\0') return false;

  char *end = nullptr;
  const long parsed = strtol(cursor, &end, 10);
  if (end == cursor ||
      (*end != '\0' && !isspace(static_cast<unsigned char>(*end))) ||
      parsed < minimum || parsed > maximum) {
    return false;
  }
  result = static_cast<int32_t>(parsed);
  cursor = end;
  skipSpaces(cursor);
  return true;
}

bool atEnd(const char *cursor) {
  skipSpaces(cursor);
  return *cursor == '\0';
}

bool isNumericText(const char *text) {
  bool hasDigit = false;
  for (const char *p = text; *p != '\0'; ++p) {
    const unsigned char c = static_cast<unsigned char>(*p);
    if (isdigit(c)) {
      hasDigit = true;
    } else if (*p != '+' && *p != '-' && *p != '.' && *p != ':' &&
               *p != '/' && *p != ' ' && *p != '|') {
      return false;
    }
  }
  return hasDigit;
}
}

void SerialFrameReceiver::reset() {
  state_ = State::MagicM;
  command_ = 0;
  length_ = 0;
  received_ = 0;
  crc_ = 0xFFFF;
  crcLow_ = 0;
  lineSize_ = 0;
}

void SerialFrameReceiver::processLine() {
  line_[lineSize_] = '\0';
  char *cursor = line_;
  while (isspace(static_cast<unsigned char>(*cursor))) ++cursor;
  if (*cursor == '\0') return;

  char *command = cursor;
  while (*cursor != '\0' && !isspace(static_cast<unsigned char>(*cursor))) {
    *cursor = static_cast<char>(toupper(static_cast<unsigned char>(*cursor)));
    ++cursor;
  }
  if (*cursor != '\0') *cursor++ = '\0';
  while (isspace(static_cast<unsigned char>(*cursor))) ++cursor;
  const char *args = cursor;
  int32_t first = 0;
  int32_t second = 0;
  int32_t third = 0;

  if (strcmp(command, "TEXT") == 0 || strcmp(command, "NUMBER") == 0) {
    if (*args == '\0' ||
        (strcmp(command, "NUMBER") == 0 && !isNumericText(args))) {
      serial_.println("ERR ARGS");
      return;
    }
    renderText(incoming_, args, fontConfig_);
    display_.showFrame(incoming_);
    ++renderRevision_;
    serial_.println(strcmp(command, "TEXT") == 0 ? "OK TEXT" : "OK NUMBER");
  } else if (strcmp(command, "PIXEL") == 0) {
    if (!readInt(args, 0, WIDTH - 1, first) ||
        !readInt(args, 0, HEIGHT - 1, second)) {
      serial_.println("ERR ARGS");
      return;
    }

    int32_t red = 255;
    int32_t green = 255;
    int32_t blue = 255;
    if (!atEnd(args) &&
        (!readInt(args, 0, 255, red) || !readInt(args, 0, 255, green) ||
         !readInt(args, 0, 255, blue))) {
      serial_.println("ERR ARGS");
      return;
    }
    if (!atEnd(args)) {
      serial_.println("ERR ARGS");
      return;
    }

    const Color color = {static_cast<uint8_t>(red),
                         static_cast<uint8_t>(green),
                         static_cast<uint8_t>(blue)};
    const int16_t index = display_.showPixel(static_cast<int16_t>(first),
                                             static_cast<int16_t>(second), color);
    if (index < 0) {
      serial_.println("ERR ARGS");
      return;
    }
    ++renderRevision_;
    serial_.print("OK PIXEL INDEX ");
    serial_.print(index);
    serial_.print(" PIN ");
    serial_.println(static_cast<int>(DATA_PIN));
  } else if (strcmp(command, "COLOR") == 0 || strcmp(command, "BG") == 0) {
    if (!readInt(args, 0, 255, first) || !readInt(args, 0, 255, second) ||
        !readInt(args, 0, 255, third) || !atEnd(args)) {
      serial_.println("ERR ARGS");
      return;
    }
    const Color color = {static_cast<uint8_t>(first), static_cast<uint8_t>(second),
                         static_cast<uint8_t>(third)};
    if (strcmp(command, "COLOR") == 0) {
      fontConfig_.foreground = color;
      serial_.println("OK COLOR");
    } else {
      fontConfig_.background = color;
      serial_.println("OK BG");
    }
  } else if (strcmp(command, "POS") == 0) {
    if (!readInt(args, 0, WIDTH - 1, first) ||
        !readInt(args, 0, HEIGHT - 1, second) || !atEnd(args)) {
      serial_.println("ERR ARGS");
      return;
    }
    fontConfig_.x = static_cast<int16_t>(first);
    fontConfig_.y = static_cast<int16_t>(second);
    serial_.println("OK POS");
  } else if (strcmp(command, "FONT") == 0) {
    if (!readInt(args, 1, 3, first) || !readInt(args, 0, 4, second) ||
        !readInt(args, 0, 4, third) || !atEnd(args)) {
      serial_.println("ERR ARGS");
      return;
    }
    fontConfig_.scale = static_cast<uint8_t>(first);
    fontConfig_.letterSpacing = static_cast<uint8_t>(second);
    fontConfig_.lineSpacing = static_cast<uint8_t>(third);
    serial_.println("OK FONT");
  } else if (strcmp(command, "BRIGHTNESS") == 0) {
    if (!readInt(args, 1, MAX_BRIGHTNESS, first) || !atEnd(args) ||
        !display_.setBrightness(static_cast<uint8_t>(first))) {
      serial_.println("ERR ARGS");
      return;
    }
    serial_.println("OK BRIGHTNESS");
  } else if (strcmp(command, "CLEAR") == 0 && atEnd(args)) {
    display_.fill({0, 0, 0});
    ++renderRevision_;
    serial_.println("OK CLEAR");
  } else if (strcmp(command, "CORNERS") == 0 && atEnd(args)) {
    display_.showCorners();
    ++renderRevision_;
    serial_.println("OK CORNERS");
  } else {
    serial_.println("ERR COMMAND");
  }
}

void SerialFrameReceiver::acceptAscii(uint8_t byte) {
  if (byte == '\r' || byte == '\n') {
    if (state_ == State::AsciiOverflow) {
      serial_.println("ERR LINE TOO LONG");
    } else if (lineSize_ > 0) {
      processLine();
    }
    state_ = State::MagicM;
    lineSize_ = 0;
    return;
  }
  if (state_ == State::AsciiOverflow) return;
  if (byte < 32 || byte > 126 || lineSize_ >= LINE_CAPACITY - 1) {
    state_ = State::AsciiOverflow;
    return;
  }
  line_[lineSize_++] = static_cast<char>(byte);
}

void SerialFrameReceiver::updateCrc(uint8_t byte) {
  crc_ ^= static_cast<uint16_t>(byte) << 8;
  for (uint8_t bit = 0; bit < 8; ++bit) {
    crc_ = (crc_ & 0x8000) ? static_cast<uint16_t>((crc_ << 1) ^ 0x1021)
                           : static_cast<uint16_t>(crc_ << 1);
  }
}

void SerialFrameReceiver::finish(uint16_t receivedCrc) {
  if (receivedCrc != crc_) {
    serial_.println("ERR CRC");
    return;
  }

  if (command_ == 'F') {
    display_.showFrame(incoming_);
    ++renderRevision_;
    serial_.println("OK FRAME");
  } else if (command_ == 'C') {
    display_.fill({0, 0, 0});
    ++renderRevision_;
    serial_.println("OK CLEAR");
  } else if (command_ == 'B') {
    const uint8_t value = reinterpret_cast<const uint8_t *>(&incoming_)[0];
    serial_.println(display_.setBrightness(value) ? "OK BRIGHTNESS"
                                                 : "ERR BRIGHTNESS");
  } else if (command_ == 'K') {
    display_.showCorners();
    ++renderRevision_;
    serial_.println("OK CORNERS");
  }
}

void SerialFrameReceiver::accept(uint8_t byte) {
  if (state_ != State::MagicM && state_ != State::AsciiLine &&
      state_ != State::AsciiOverflow &&
      millis() - lastByteAt_ > PACKET_TIMEOUT_MS) {
    if (state_ != State::ResyncM && state_ != State::ResyncX) {
      serial_.println("ERR TIMEOUT");
    }
    reset();
  }
  lastByteAt_ = millis();

  switch (state_) {
    case State::MagicM:
      if (byte == 'M') state_ = State::MagicX;
      else if (byte >= 32 && byte <= 126) {
        state_ = State::AsciiLine;
        acceptAscii(byte);
      }
      break;
    case State::MagicX:
      if (byte == 'X') state_ = State::Command;
      else {
        state_ = State::AsciiLine;
        acceptAscii('M');
        acceptAscii(byte);
      }
      break;
    case State::Command:
      command_ = byte;
      updateCrc(byte);
      state_ = State::LengthLow;
      break;
    case State::LengthLow:
      length_ = byte;
      updateCrc(byte);
      state_ = State::LengthHigh;
      break;
    case State::LengthHigh:
      length_ |= static_cast<uint16_t>(byte) << 8;
      updateCrc(byte);
      if (!((command_ == 'F' && length_ == sizeof(Frame)) ||
            (command_ == 'B' && length_ == 1) ||
            ((command_ == 'C' || command_ == 'K') && length_ == 0))) {
        serial_.println("ERR HEADER");
        // Ignore the remainder of an invalid binary packet. Otherwise RGB
        // bytes containing printable text could be mistaken for ASCII commands.
        state_ = State::ResyncM;
      } else {
        state_ = length_ == 0 ? State::CrcLow : State::Payload;
      }
      break;
    case State::Payload:
      reinterpret_cast<uint8_t *>(&incoming_)[received_++] = byte;
      updateCrc(byte);
      if (received_ == length_) state_ = State::CrcLow;
      break;
    case State::CrcLow:
      crcLow_ = byte;
      state_ = State::CrcHigh;
      break;
    case State::CrcHigh:
      finish(crcLow_ | (static_cast<uint16_t>(byte) << 8));
      reset();
      break;
    case State::AsciiLine:
    case State::AsciiOverflow:
      acceptAscii(byte);
      break;
    case State::ResyncM:
      if (byte == 'M') state_ = State::ResyncX;
      break;
    case State::ResyncX:
      if (byte == 'X') {
        reset();
        state_ = State::Command;
      } else {
        state_ = byte == 'M' ? State::ResyncX : State::ResyncM;
      }
      break;
  }
}

void SerialFrameReceiver::poll() {
  while (serial_.available() > 0) {
    const int value = serial_.read();
    if (value >= 0) accept(static_cast<uint8_t>(value));
  }
}

}  // namespace Matrix
