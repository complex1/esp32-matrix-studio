#include "MatrixFont.h"

namespace Matrix {
namespace {

constexpr int32_t GLYPH_WIDTH = 3;
constexpr int32_t GLYPH_HEIGHT = 5;

struct Glyph {
  char character;
  uint8_t rows[GLYPH_HEIGHT];  // Three low bits per row, left bit is 0b100.
};

// Fixed-width glyphs are kept as data so changing a letter does not affect
// serial parsing or the physical LED mapping.
const Glyph GLYPHS[] = {
    {'A', {0b010, 0b101, 0b111, 0b101, 0b101}},
    {'B', {0b110, 0b101, 0b110, 0b101, 0b110}},
    {'C', {0b011, 0b100, 0b100, 0b100, 0b011}},
    {'D', {0b110, 0b101, 0b101, 0b101, 0b110}},
    {'E', {0b111, 0b100, 0b110, 0b100, 0b111}},
    {'F', {0b111, 0b100, 0b110, 0b100, 0b100}},
    {'G', {0b011, 0b100, 0b101, 0b101, 0b011}},
    {'H', {0b101, 0b101, 0b111, 0b101, 0b101}},
    {'I', {0b111, 0b010, 0b010, 0b010, 0b111}},
    {'J', {0b001, 0b001, 0b001, 0b101, 0b010}},
    {'K', {0b101, 0b101, 0b110, 0b101, 0b101}},
    {'L', {0b100, 0b100, 0b100, 0b100, 0b111}},
    {'M', {0b101, 0b111, 0b111, 0b101, 0b101}},
    {'N', {0b101, 0b111, 0b111, 0b111, 0b101}},
    {'O', {0b010, 0b101, 0b101, 0b101, 0b010}},
    {'P', {0b110, 0b101, 0b110, 0b100, 0b100}},
    {'Q', {0b010, 0b101, 0b101, 0b111, 0b011}},
    {'R', {0b110, 0b101, 0b110, 0b101, 0b101}},
    {'S', {0b011, 0b100, 0b010, 0b001, 0b110}},
    {'T', {0b111, 0b010, 0b010, 0b010, 0b010}},
    {'U', {0b101, 0b101, 0b101, 0b101, 0b111}},
    {'V', {0b101, 0b101, 0b101, 0b101, 0b010}},
    {'W', {0b101, 0b101, 0b111, 0b111, 0b101}},
    {'X', {0b101, 0b101, 0b010, 0b101, 0b101}},
    {'Y', {0b101, 0b101, 0b010, 0b010, 0b010}},
    {'Z', {0b111, 0b001, 0b010, 0b100, 0b111}},
    {'0', {0b111, 0b101, 0b101, 0b101, 0b111}},
    {'1', {0b010, 0b110, 0b010, 0b010, 0b111}},
    {'2', {0b111, 0b001, 0b111, 0b100, 0b111}},
    {'3', {0b111, 0b001, 0b111, 0b001, 0b111}},
    {'4', {0b101, 0b101, 0b111, 0b001, 0b001}},
    {'5', {0b111, 0b100, 0b111, 0b001, 0b111}},
    {'6', {0b111, 0b100, 0b111, 0b101, 0b111}},
    {'7', {0b111, 0b001, 0b010, 0b010, 0b010}},
    {'8', {0b111, 0b101, 0b111, 0b101, 0b111}},
    {'9', {0b111, 0b101, 0b111, 0b001, 0b111}},
    {' ', {0b000, 0b000, 0b000, 0b000, 0b000}},
    {'.', {0b000, 0b000, 0b000, 0b000, 0b010}},
    {',', {0b000, 0b000, 0b000, 0b010, 0b100}},
    {':', {0b000, 0b010, 0b000, 0b010, 0b000}},
    {'!', {0b010, 0b010, 0b010, 0b000, 0b010}},
    {'?', {0b111, 0b001, 0b011, 0b000, 0b010}},
    {'-', {0b000, 0b000, 0b111, 0b000, 0b000}},
    {'+', {0b000, 0b010, 0b111, 0b010, 0b000}},
    {'/', {0b001, 0b001, 0b010, 0b100, 0b100}},
    {'=', {0b000, 0b111, 0b000, 0b111, 0b000}},
    {'_', {0b000, 0b000, 0b000, 0b000, 0b111}},
    {'\'', {0b010, 0b010, 0b000, 0b000, 0b000}},
};

const Glyph &glyphFor(char c) {
  if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
  for (const Glyph &glyph : GLYPHS) {
    if (glyph.character == c) return glyph;
  }
  for (const Glyph &glyph : GLYPHS) {
    if (glyph.character == '?') return glyph;
  }
  return GLYPHS[0];  // Unreachable while the '?' glyph is present.
}

void plotScaledPixel(Frame &frame, int32_t x, int32_t y, int32_t scale,
                     Color color) {
  const int32_t left = x < 0 ? 0 : x;
  const int32_t top = y < 0 ? 0 : y;
  const int32_t right = x + scale > WIDTH ? WIDTH : x + scale;
  const int32_t bottom = y + scale > HEIGHT ? HEIGHT : y + scale;
  for (int32_t py = top; py < bottom; ++py) {
    for (int32_t px = left; px < right; ++px) {
      frame.pixels[py][px] = color;
    }
  }
}

}  // namespace

void renderText(Frame &frame, const char *text, const FontConfig &config) {
  for (int16_t y = 0; y < HEIGHT; ++y) {
    for (int16_t x = 0; x < WIDTH; ++x) {
      frame.pixels[y][x] = config.background;
    }
  }
  if (text == nullptr) return;

  // Treat scale=0 as 1; int32_t arithmetic also keeps large user settings safe.
  const int32_t scale = config.scale == 0 ? 1 : config.scale;
  const int32_t glyphWidth = GLYPH_WIDTH * scale;
  const int32_t charAdvance = (GLYPH_WIDTH + config.letterSpacing) * scale;
  const int32_t lineAdvance = (GLYPH_HEIGHT + config.lineSpacing) * scale;
  const int32_t lineStartX = config.x;
  int32_t cursorX = lineStartX;
  int32_t cursorY = config.y;

  for (const char *p = text; *p != '\0'; ++p) {
    if (*p == '\r') continue;  // Accept CRLF lines sent from a terminal.
    if (*p == '\n' || *p == '|') {
      cursorX = lineStartX;
      cursorY += lineAdvance;
      continue;
    }
    if (cursorX != lineStartX && cursorX + glyphWidth > WIDTH) {
      cursorX = lineStartX;
      cursorY += lineAdvance;
    }
    const Glyph &glyph = glyphFor(*p);
    for (int32_t row = 0; row < GLYPH_HEIGHT; ++row) {
      for (int32_t col = 0; col < GLYPH_WIDTH; ++col) {
        if ((glyph.rows[row] & (0b100 >> col)) == 0) continue;
        plotScaledPixel(frame, cursorX + col * scale, cursorY + row * scale,
                        scale, config.foreground);
      }
    }
    cursorX += charAdvance;
  }
}

void drawTextLine(Frame &frame, const char *text, const FontConfig &config) {
  if (text == nullptr) return;
  const int32_t scale = config.scale == 0 ? 1 : config.scale;
  const int32_t advance = (GLYPH_WIDTH + config.letterSpacing) * scale;
  int32_t cursorX = config.x;
  for (const char *p = text; *p != '\0'; ++p, cursorX += advance) {
    const Glyph &glyph = glyphFor(*p);
    for (int32_t row = 0; row < GLYPH_HEIGHT; ++row) {
      for (int32_t col = 0; col < GLYPH_WIDTH; ++col) {
        if (glyph.rows[row] & (0b100 >> col)) {
          plotScaledPixel(frame, cursorX + col * scale,
                          config.y + row * scale, scale, config.foreground);
        }
      }
    }
  }
}

}  // namespace Matrix
