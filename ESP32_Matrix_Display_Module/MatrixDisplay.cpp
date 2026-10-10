#include "MatrixDisplay.h"

namespace Matrix {

namespace {
// Calibration photo IMG_0226 2.HEIC showed these physical column swaps in
// the original formula: 1<->2, 3<->4, 5<->6, 11<->12, and 13<->14.
// To draw at a desired visual x, use the old-formula x that reaches it.
// These two-way swaps are their own inverse; do not apply this to y.
constexpr uint8_t RAW_X_FOR_VISUAL_X[WIDTH] = {
    0, 2, 1, 4, 3, 6, 5, 7, 8, 9,
    10, 12, 11, 14, 13, 15, 16, 17, 18, 19};
static_assert(sizeof(RAW_X_FOR_VISUAL_X) == WIDTH,
              "Column calibration must cover all 20 columns");
}  // namespace

void Display::begin() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds_, LED_COUNT);
  FastLED.setBrightness(brightness_);
  FastLED.clear();
  FastLED.show();
}

int16_t Display::indexForXY(int16_t x, int16_t y) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return -1;

  // First correct the observed column placement. The physical LED data then
  // travels up C1, down C2, and snakes through the 20 strips as before.
  const int16_t rawX = RAW_X_FOR_VISUAL_X[x];
  const int16_t column = WIDTH - rawX;
  const int16_t first = (column - 1) * HEIGHT;
  return first + ((column & 1) ? HEIGHT - 1 - y : y);
}

void Display::showFrame(const Frame &frame) {
  for (int16_t y = 0; y < HEIGHT; ++y) {
    for (int16_t x = 0; x < WIDTH; ++x) {
      const Color &color = frame.pixels[y][x];
      leds_[indexForXY(x, y)] = CRGB(color.red, color.green, color.blue);
    }
  }
  FastLED.show();
}

int16_t Display::showPixel(int16_t x, int16_t y, Color color) {
  const int16_t index = indexForXY(x, y);
  if (index < 0) return -1;

  FastLED.clear();
  leds_[index] = CRGB(color.red, color.green, color.blue);
  FastLED.show();
  return index;
}

void Display::fill(Color color) {
  fill_solid(leds_, LED_COUNT, CRGB(color.red, color.green, color.blue));
  FastLED.show();
}

void Display::showCorners() {
  FastLED.clear();
  leds_[indexForXY(0, 0)] = CRGB::Red;
  leds_[indexForXY(WIDTH - 1, 0)] = CRGB::Green;
  leds_[indexForXY(0, HEIGHT - 1)] = CRGB::Blue;
  leds_[indexForXY(WIDTH - 1, HEIGHT - 1)] = CRGB::White;
  FastLED.show();
}

bool Display::setBrightness(uint8_t brightness) {
  if (brightness < 1 || brightness > MAX_BRIGHTNESS) return false;
  brightness_ = brightness;
  FastLED.setBrightness(brightness_);
  FastLED.show();
  return true;
}

}  // namespace Matrix
