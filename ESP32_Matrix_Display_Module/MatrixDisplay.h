#pragma once

#include <Arduino.h>
#include <FastLED.h>

namespace Matrix {

constexpr int16_t WIDTH = 20;
constexpr int16_t HEIGHT = 15;
constexpr uint16_t LED_COUNT = WIDTH * HEIGHT;

// Confirmed current DIN connection: GPIO25.
constexpr uint8_t DATA_PIN = 25;
constexpr uint8_t START_BRIGHTNESS = 16;
constexpr uint8_t MAX_BRIGHTNESS = 64;

struct Color {
  uint8_t red;
  uint8_t green;
  uint8_t blue;
};

// A complete image: pixels[y][x], with (0,0) at the visible top-left.
struct Frame {
  Color pixels[HEIGHT][WIDTH];
};

static_assert(sizeof(Color) == 3, "Each RGB color must occupy three bytes");
static_assert(sizeof(Frame) == 900, "A 15x20 RGB frame must be 900 bytes");

class Display {
 public:
  void begin();
  void showFrame(const Frame &frame);
  // Clears the display and lights one XY coordinate. Returns its LED index.
  int16_t showPixel(int16_t x, int16_t y, Color color);
  void fill(Color color);
  void showCorners();
  bool setBrightness(uint8_t brightness);
  uint8_t brightness() const { return brightness_; }

  // Returns the physical LED index (0..299), or -1 if out of range.
  static int16_t indexForXY(int16_t x, int16_t y);

 private:
  CRGB leds_[LED_COUNT];
  uint8_t brightness_ = START_BRIGHTNESS;
};

}  // namespace Matrix
