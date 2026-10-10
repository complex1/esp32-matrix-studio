#pragma once

#include "MatrixDisplay.h"

namespace Matrix {

// A compact 3x5 font for the 20x15 display. Coordinates are visible XY,
// with (0,0) at the top-left. Spacing is measured in unscaled font pixels.
struct FontConfig {
  int16_t x = 0;
  int16_t y = 0;
  uint8_t scale = 1;
  uint8_t letterSpacing = 1;
  uint8_t lineSpacing = 1;
  Color foreground{255, 255, 255};
  Color background{0, 0, 0};
};

// Clears the entire frame to background, then draws text. Lowercase letters
// use uppercase glyphs. '\n' and '|' start a new line; long lines wrap when
// the next glyph would pass the right edge. Pixels outside the frame are clipped.
// Unsupported printable characters render as '?'. No heap allocation or String.
void renderText(Frame &frame, const char *text, const FontConfig &config);

// Draws one clipped horizontal line without clearing or wrapping the frame.
// The autonomous marquee and clock use this so off-screen letters remain on
// their original baseline instead of wrapping into another row.
void drawTextLine(Frame &frame, const char *text, const FontConfig &config);

}  // namespace Matrix
