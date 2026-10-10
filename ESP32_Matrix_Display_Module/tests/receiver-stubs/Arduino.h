#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>

uint32_t millis();

class Stream {
 public:
  virtual ~Stream() = default;
  virtual int available() = 0;
  virtual int read() = 0;
  virtual void print(const char *) = 0;
  virtual void print(int) = 0;
  virtual void println(const char *) = 0;
  virtual void println(int) = 0;
};
