#pragma once

#include "MatrixDisplay.h"

namespace Matrix {

// IDs are shared with web/effects.mjs. tSeconds is already speed-adjusted.
void renderEffect(Frame &frame, uint8_t id, float tSeconds, Color color);

}  // namespace Matrix
