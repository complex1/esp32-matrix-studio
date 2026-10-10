#include "ModeEngine.h"

#include "MatrixEffects.h"
#include "MatrixFont.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace Matrix {
namespace {
constexpr float PI_F = 3.14159265358979323846f;

void clearFrame(Frame &frame, Color color) {
  for (int y = 0; y < HEIGHT; ++y)
    for (int x = 0; x < WIDTH; ++x) frame.pixels[y][x] = color;
}

Color dim(Color c, float amount) {
  return {static_cast<uint8_t>(c.red * amount),
          static_cast<uint8_t>(c.green * amount),
          static_cast<uint8_t>(c.blue * amount)};
}

void pixel(Frame &frame, int x, int y, Color c) {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) frame.pixels[y][x] = c;
}

void line(Frame &frame, int x0, int y0, int x1, int y1, Color c) {
  const int dx = abs(x1 - x0), dy = -abs(y1 - y0);
  const int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  int error = dx + dy;
  while (true) {
    pixel(frame, x0, y0, c);
    if (x0 == x1 && y0 == y1) break;
    const int twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}
}  // namespace

ModeEngine::~ModeEngine() { free(frames_); }

void ModeEngine::activate(Mode mode) {
  mode_ = mode;
  elapsedMs_ = 0;
  lastTickMs_ = millis();
  lastRenderMs_ = lastTickMs_;
  firstRender_ = true;
  lastFrame_ = 255;
}

void ModeEngine::stop() { mode_ = Mode::Manual; }

void ModeEngine::beginNetworkStatus() {
  networkState_ = NetworkState::Connecting;
  thirdOctet_ = 0;
  fourthOctet_ = 0;
  activate(Mode::NetworkStatus);
}

void ModeEngine::updateNetworkStatus(NetworkState state, uint8_t thirdOctet,
                                      uint8_t fourthOctet) {
  if (mode_ != Mode::NetworkStatus) return;
  if (state == networkState_ && thirdOctet == thirdOctet_ && fourthOctet == fourthOctet_)
    return;
  networkState_ = state;
  thirdOctet_ = thirdOctet;
  fourthOctet_ = fourthOctet;
  firstRender_ = true;
}

bool ModeEngine::startClock(uint32_t epochSeconds, int16_t offsetMinutes,
                            bool analog, bool hour12, Color fg, Color bg) {
  if (epochSeconds < 946684800UL || offsetMinutes < -840 || offsetMinutes > 840)
    return false;
  epochSeconds_ = epochSeconds;
  offsetMinutes_ = offsetMinutes;
  analog_ = analog;
  hour12_ = hour12;
  foreground_ = fg;
  background_ = bg;
  activate(Mode::Clock);
  return true;
}

bool ModeEngine::startTimer(uint32_t seconds, Color fg, Color bg) {
  if (seconds == 0 || seconds > 86400UL) return false;
  timerSeconds_ = seconds;
  foreground_ = fg;
  background_ = bg;
  activate(Mode::Timer);
  return true;
}

bool ModeEngine::startEffect(uint8_t id, uint8_t speed, Color color) {
  if (id >= EFFECT_COUNT || speed < 1 || speed > 100) return false;
  effectId_ = id;
  speed_ = speed;
  foreground_ = color;
  activate(Mode::Effect);
  return true;
}

bool ModeEngine::startText(const char *text, uint8_t speed, uint8_t scale,
                           Color fg, Color bg) {
  if (!text || speed < 1 || speed > 100 || scale < 1 || scale > 2) return false;
  const size_t length = strnlen(text, sizeof(text_));
  if (length == 0 || length >= sizeof(text_)) return false;
  for (size_t i = 0; i < length; ++i)
    if (static_cast<uint8_t>(text[i]) < 32 || static_cast<uint8_t>(text[i]) > 126)
      return false;
  memcpy(text_, text, length + 1);
  speed_ = speed;
  scale_ = scale;
  foreground_ = fg;
  background_ = bg;
  activate(Mode::Text);
  return true;
}

bool ModeEngine::beginFrames(uint8_t count) {
  if (count < 1 || count > MAX_ANIMATION_FRAMES) return false;
  Frame *replacement = static_cast<Frame *>(malloc(sizeof(Frame) * count));
  if (!replacement) return false;
  stop();
  free(frames_);
  frames_ = replacement;
  frameCount_ = count;
  readyFrames_ = 0;
  return true;
}

bool ModeEngine::setFrame(uint8_t index, const Frame &frame) {
  if (!frames_ || index >= frameCount_) return false;
  frames_[index] = frame;
  readyFrames_ |= uint64_t(1) << index;
  return true;
}

bool ModeEngine::startFrames(uint16_t intervalMs, bool loop) {
  if (!frames_ || frameCount_ == 0 || intervalMs < 50 || intervalMs > 2000)
    return false;
  const uint64_t required = (uint64_t(1) << frameCount_) - 1;
  if ((readyFrames_ & required) != required) return false;
  intervalMs_ = intervalMs;
  loop_ = loop;
  activate(Mode::Animation);
  return true;
}

const char *ModeEngine::modeName() const {
  switch (mode_) {
    case Mode::Clock: return "clock";
    case Mode::Timer: return "timer";
    case Mode::Effect: return "effect";
    case Mode::Text: return "text";
    case Mode::Animation: return "animation";
    case Mode::NetworkStatus: return "network";
    default: return "manual";
  }
}

void ModeEngine::renderNetworkStatus() {
  clearFrame(scratch_, {0, 0, 0});
  const Color cyan{0, 200, 255};
  const Color amber{255, 150, 0};
  FontConfig cfg;
  cfg.foreground = cyan;
  const auto centeredLine = [this, &cfg](const char *value, int16_t y) {
    const int16_t width = static_cast<int16_t>(strlen(value) * 4 - 1);
    cfg.x = (WIDTH - width) / 2;
    cfg.y = y;
    drawTextLine(scratch_, value, cfg);
  };
  if (networkState_ == NetworkState::Connected) {
    char suffix[8];
    snprintf(suffix, sizeof(suffix), "%u.%u", unsigned(thirdOctet_), unsigned(fourthOctet_));
    if (strlen(suffix) * 4 - 1 <= WIDTH) {
      centeredLine(suffix, 5);
    } else {
      char upper[5], lower[4];
      snprintf(upper, sizeof(upper), "%u.", unsigned(thirdOctet_));
      snprintf(lower, sizeof(lower), "%u", unsigned(fourthOctet_));
      centeredLine(upper, 1);
      centeredLine(lower, 9);
    }
  } else if (networkState_ == NetworkState::Connecting) {
    const bool phase = (elapsedMs_ / 750) % 2;
    cfg.foreground = phase ? amber : cyan;
    centeredLine("WIFI", 1);
    if (!phase) centeredLine("...", 9);
  } else {
    cfg.foreground = amber;
    centeredLine("NO", 1);
    centeredLine("WIFI", 9);
    cfg.x = 17; cfg.y = 1; cfg.foreground = {255, 55, 40};
    drawTextLine(scratch_, "!", cfg);
  }
}

void ModeEngine::renderClock() {
  clearFrame(scratch_, background_);
  int64_t localSeconds = int64_t(epochSeconds_) + int64_t(elapsedMs_ / 1000) +
                         int64_t(offsetMinutes_) * 60;
  const int seconds = int(localSeconds % 60);
  const int minutes = int((localSeconds / 60) % 60);
  const int hours = int((localSeconds / 3600) % 24);
  const float fraction = float(elapsedMs_ % 1000) / 1000.0f;
  if (analog_) {
    constexpr float cx = 9.5f, cy = 7.0f;
    for (int marker = 0; marker < 12; ++marker) {
      const float angle = marker * PI_F / 6 - PI_F / 2;
      pixel(scratch_, lroundf(cx + cosf(angle) * 6),
            lroundf(cy + sinf(angle) * 6), dim(foreground_, marker % 3 ? 0.35f : 0.7f));
    }
    const float hourAngle = ((hours % 12) + minutes / 60.0f) * PI_F / 6 - PI_F / 2;
    const float minuteAngle = (minutes + seconds / 60.0f) * PI_F / 30 - PI_F / 2;
    const float secondAngle = (seconds + fraction) * PI_F / 30 - PI_F / 2;
    line(scratch_, 10, 7, lroundf(cx + cosf(hourAngle) * 3.2f),
         lroundf(cy + sinf(hourAngle) * 3.2f), dim(foreground_, 0.65f));
    line(scratch_, 10, 7, lroundf(cx + cosf(minuteAngle) * 5),
         lroundf(cy + sinf(minuteAngle) * 5), foreground_);
    const Color secondsColor{255, 72, 80};
    line(scratch_, 10, 7, lroundf(cx + cosf(secondAngle) * 5.8f),
         lroundf(cy + sinf(secondAngle) * 5.8f), secondsColor);
    pixel(scratch_, 10, 7, {255, 255, 255});
  } else {
    char value[6];
    const int displayHour = hour12_ ? ((hours + 11) % 12 + 1) : hours;
    snprintf(value, sizeof(value), "%02d %02d", displayHour, minutes);
    FontConfig cfg;
    cfg.x = 0; cfg.y = 5; cfg.foreground = foreground_;
    drawTextLine(scratch_, value, cfg);
    cfg.x = 8;
    cfg.foreground = dim(foreground_, 0.35f + 0.65f * (0.5f + 0.5f * cosf(fraction * 2 * PI_F)));
    drawTextLine(scratch_, ":", cfg);
    if (hour12_) {
      cfg.x = 6; cfg.y = 11; cfg.foreground = dim(foreground_, 0.6f);
      drawTextLine(scratch_, hours < 12 ? "AM" : "PM", cfg);
    }
    const int progress = int((seconds + fraction) * WIDTH / 60);
    for (int x = 0; x <= progress && x < WIDTH; ++x)
      scratch_.pixels[14][x] = dim(foreground_, 0.25f);
  }
}

void ModeEngine::renderTimer() {
  clearFrame(scratch_, background_);
  const uint64_t duration = uint64_t(timerSeconds_) * 1000;
  const uint32_t remaining = elapsedMs_ >= duration ? 0 :
      uint32_t((duration - elapsedMs_ + 999) / 1000);
  char value[6];
  if (remaining >= 3600)
    snprintf(value, sizeof(value), "%02lu:%02lu",
             static_cast<unsigned long>(remaining / 3600),
             static_cast<unsigned long>((remaining / 60) % 60));
  else
    snprintf(value, sizeof(value), "%02lu:%02lu",
             static_cast<unsigned long>(remaining / 60),
             static_cast<unsigned long>(remaining % 60));
  FontConfig cfg;
  cfg.x = 0; cfg.y = 5; cfg.foreground = foreground_;
  if (remaining == 0) {
    const float pulse = 0.3f + 0.7f * (0.5f + 0.5f * sinf(float(elapsedMs_ % 2000) * PI_F / 1000));
    cfg.foreground = dim(foreground_, pulse);
  }
  drawTextLine(scratch_, value, cfg);
  if (remaining == 0) {
    cfg.x = 2; cfg.y = 11;
    drawTextLine(scratch_, "DONE", cfg);
  } else {
    const int progress = int(uint64_t(remaining) * WIDTH / timerSeconds_);
    for (int x = 0; x < progress; ++x) scratch_.pixels[13][x] = dim(foreground_, 0.3f);
  }
}

void ModeEngine::renderText() {
  clearFrame(scratch_, background_);
  const float pixelsPerSecond = 2.0f + speed_ * 0.24f;
  const int width = int(strlen(text_)) * 4 * scale_;
  const int cycle = width + WIDTH;
  const int movement = int(fmod(double(elapsedMs_) / 1000 * pixelsPerSecond, cycle));
  FontConfig cfg;
  cfg.x = WIDTH - movement;
  cfg.y = (HEIGHT - 5 * scale_) / 2;
  cfg.scale = scale_;
  cfg.foreground = foreground_;
  drawTextLine(scratch_, text_, cfg);
}

void ModeEngine::tick() {
  if (mode_ == Mode::Manual) return;
  const uint32_t now = millis();
  elapsedMs_ += uint32_t(now - lastTickMs_);  // Correct across millis() rollover.
  lastTickMs_ = now;
  const uint32_t refresh = mode_ == Mode::Clock || mode_ == Mode::Timer ||
                           mode_ == Mode::NetworkStatus ? 100 : 50;
  if (!firstRender_ && uint32_t(now - lastRenderMs_) < refresh) return;
  firstRender_ = false;
  lastRenderMs_ = now;
  switch (mode_) {
    case Mode::Clock: renderClock(); break;
    case Mode::Timer: renderTimer(); break;
    case Mode::Text: renderText(); break;
    case Mode::NetworkStatus: renderNetworkStatus(); break;
    case Mode::Effect:
      Matrix::renderEffect(scratch_, effectId_,
          float(double(elapsedMs_) / 1000 * (0.2 + speed_ / 25.0)), foreground_);
      break;
    case Mode::Animation: {
      const uint64_t sequenceIndex = elapsedMs_ / intervalMs_;
      const uint8_t index = loop_ ? uint8_t(sequenceIndex % frameCount_) :
          (sequenceIndex < frameCount_ ? uint8_t(sequenceIndex) : frameCount_ - 1);
      if (index != lastFrame_) { display_.showFrame(frames_[index]); lastFrame_ = index; }
      if (!loop_ && sequenceIndex >= frameCount_) stop();
      return;
    }
    default: return;
  }
  display_.showFrame(scratch_);
}

}  // namespace Matrix
