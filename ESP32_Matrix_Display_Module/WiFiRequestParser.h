#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace Matrix {
namespace RequestParsing {

// A URL-encoded form is decoded into the existing bounded request buffer.
// No heap allocation or Arduino types are needed by this parser.
class FormFields {
 public:
  bool parse(uint8_t *body, size_t length, size_t capacity) {
    count_ = 0;
    if (!body || length == 0 || length >= capacity) return false;
    size_t read = 0;
    size_t write = 0;
    while (read < length) {
      if (count_ == MAX_FIELDS) return false;
      size_t end = read;
      while (end < length && body[end] != '&') ++end;
      size_t equals = read;
      while (equals < end && body[equals] != '=') ++equals;
      if (equals == read || equals == end) return false;
      const size_t keyStart = write;
      if (!decode(body, read, equals, write, true)) return false;
      const char *key = reinterpret_cast<const char *>(body + keyStart);
      for (size_t i = 0; i < count_; ++i) if (strcmp(fields_[i].key, key) == 0) return false;
      const size_t valueStart = write;
      if (!decode(body, equals + 1, end, write, false)) return false;
      fields_[count_++] = {key, reinterpret_cast<const char *>(body + valueStart)};
      read = end + 1;
      if (read == length) return false;  // Reject an empty trailing field.
    }
    return true;
  }

  const char *get(const char *key) const {
    for (size_t i = 0; i < count_; ++i) if (strcmp(fields_[i].key, key) == 0) return fields_[i].value;
    return "";
  }

 private:
  static int hex(uint8_t c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  }

  static bool decode(uint8_t *body, size_t start, size_t end, size_t &write, bool key) {
    const size_t outputStart = write;
    for (size_t read = start; read < end; ++read) {
      uint8_t c = body[read];
      if (c == '+') c = ' ';
      else if (c == '%') {
        if (read + 2 >= end) return false;
        const int high = hex(body[read + 1]), low = hex(body[read + 2]);
        if (high < 0 || low < 0) return false;
        c = static_cast<uint8_t>((high << 4) | low);
        read += 2;
      }
      if (c < 32 || c > 126) return false;
      if (key && !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                   (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
      body[write++] = c;
      if (key && write - outputStart > 24) return false;
    }
    body[write++] = '\0';
    return true;
  }

  struct Field { const char *key; const char *value; };
  static constexpr size_t MAX_FIELDS = 12;
  Field fields_[MAX_FIELDS] = {};
  size_t count_ = 0;
};

inline bool replacesDisplay(const uint8_t *request, size_t length) {
  if (!request || length == 0) return false;
  if (length >= 3 && request[0] == 'M' && request[1] == 'X') {
    return request[2] == 'F' || request[2] == 'C' || request[2] == 'K';
  }
  size_t start = 0;
  while (start < length && request[start] == ' ') ++start;
  size_t end = start;
  while (end < length && request[end] != ' ' && request[end] != '\r' && request[end] != '\n') ++end;
  const char *commands[] = {"TEXT", "NUMBER", "PIXEL", "CLEAR", "CORNERS"};
  for (const char *command : commands) {
    if (end - start != strlen(command)) continue;
    bool matches = true;
    for (size_t i = start; i < end; ++i) {
      const uint8_t c = request[i] >= 'a' && request[i] <= 'z' ? request[i] - 'a' + 'A' : request[i];
      if (c != static_cast<uint8_t>(command[i - start])) { matches = false; break; }
    }
    if (matches) return true;
  }
  return false;
}

}  // namespace RequestParsing
}  // namespace Matrix
