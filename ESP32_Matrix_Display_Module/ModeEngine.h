#pragma once

#include "MatrixDisplay.h"

namespace Matrix {

constexpr uint8_t EFFECT_COUNT = 60;
constexpr uint8_t MAX_ANIMATION_FRAMES = 48;

// One autonomous mode owns the display at a time. The server calls stop()
// before a manual draw; tick() never blocks and caps refresh at 20 fps.
class ModeEngine {
 public:
  enum class NetworkState : uint8_t { Connecting, Connected, Unavailable };

  explicit ModeEngine(Display &display) : display_(display) {}
  ~ModeEngine();
  ModeEngine(const ModeEngine &) = delete;
  ModeEngine &operator=(const ModeEngine &) = delete;

  void tick();
  void stop();
  void beginNetworkStatus();
  // Network events may update the startup display only while it owns the
  // screen. Once a user starts another mode, later Wi-Fi events cannot steal it.
  void updateNetworkStatus(NetworkState state, uint8_t thirdOctet = 0,
                            uint8_t fourthOctet = 0);
  bool startClock(uint32_t epochSeconds, int16_t offsetMinutes, bool analog,
                  bool hour12, Color foreground, Color background);
  bool startTimer(uint32_t seconds, Color foreground, Color background);
  bool startEffect(uint8_t id, uint8_t speed, Color color);
  bool startText(const char *text, uint8_t speed, uint8_t scale,
                 Color foreground, Color background);
  bool beginFrames(uint8_t count);
  bool setFrame(uint8_t index, const Frame &frame);
  bool startFrames(uint16_t intervalMs, bool loop);
  const char *modeName() const;
  uint8_t effectId() const { return effectId_; }
  uint8_t frameCount() const { return frameCount_; }

 private:
  enum class Mode : uint8_t { Manual, Clock, Timer, Effect, Text, Animation, NetworkStatus };
  void activate(Mode mode);
  void renderClock();
  void renderTimer();
  void renderText();
  void renderNetworkStatus();

  Display &display_;
  Mode mode_ = Mode::Manual;
  Frame scratch_{};
  Frame *frames_ = nullptr;
  uint64_t readyFrames_ = 0;
  uint64_t elapsedMs_ = 0;
  uint32_t lastTickMs_ = 0;
  uint32_t lastRenderMs_ = 0;
  uint32_t epochSeconds_ = 0;
  uint32_t timerSeconds_ = 0;
  int16_t offsetMinutes_ = 0;
  uint16_t intervalMs_ = 100;
  uint8_t frameCount_ = 0;
  uint8_t lastFrame_ = 255;
  uint8_t effectId_ = 0;
  uint8_t speed_ = 50;
  uint8_t scale_ = 1;
  NetworkState networkState_ = NetworkState::Connecting;
  uint8_t thirdOctet_ = 0;
  uint8_t fourthOctet_ = 0;
  bool analog_ = false;
  bool hour12_ = false;
  bool loop_ = true;
  bool firstRender_ = false;
  Color foreground_{255, 255, 255};
  Color background_{0, 0, 0};
  char text_[241]{};
};

}  // namespace Matrix
