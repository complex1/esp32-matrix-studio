#pragma once

#include <WebServer.h>
#include "SerialFrameReceiver.h"
#include "ModeEngine.h"
#include "WiFiRequestParser.h"
#include "WiFiConfig.h"
#include "RouterConnectionPolicy.h"

namespace Matrix {

class ControlWebServer : public WebServer {
 public:
  using WebServer::WebServer;
  // Raw callbacks run before WebServer's usual response reset. Reset explicitly
  // when rejecting a request early so old response headers are not reused.
  void beginEarlyReply() {
    _contentLength = CONTENT_LENGTH_NOT_SET;
    _responseCode = 0;
    _chunked = false;
    _clearResponseHeaders();
  }
};

// Lets HTTP requests use the exact same command and frame parser as USB.
class BufferedCommandStream : public Stream {
 public:
  void begin(const uint8_t *input, size_t length) {
    input_ = input;
    length_ = length;
    position_ = 0;
    replySize_ = 0;
    reply_[0] = '\0';
  }
  int available() override { return static_cast<int>(length_ - position_); }
  int read() override { return available() ? input_[position_++] : -1; }
  int peek() override { return available() ? input_[position_] : -1; }
  void flush() override {}
  size_t write(uint8_t byte) override {
    if (replySize_ >= sizeof(reply_) - 1) return 0;
    reply_[replySize_++] = static_cast<char>(byte);
    reply_[replySize_] = '\0';
    return 1;
  }
  using Print::write;
  const char *reply() const { return reply_; }

 private:
  const uint8_t *input_ = nullptr;
  size_t length_ = 0;
  size_t position_ = 0;
  char reply_[160] = {};
  size_t replySize_ = 0;
};

class WiFiControl {
 public:
  WiFiControl(Display &display, ModeEngine &modes)
      : display_(display), modes_(modes), receiver_(commandStream_, display) {}
  void begin();
  void poll();

 private:
  void addCors();
  void status();
  void receiveRaw();
  void rejectRaw(int statusCode, const char *message);
  bool prepareForm();
  String formArg(const char *name) const;
  void processRequest();
  void error(int statusCode, const char *message);
  bool authorize();
  void setMode();
  void resetFrames();
  void saveFrame();
  void startFrames();
  void beginRouterAttempt();
  void pollRouter();

  Display &display_;
  ModeEngine &modes_;
  BufferedCommandStream commandStream_;
  SerialFrameReceiver receiver_;
  ControlWebServer server_{80};
  static constexpr size_t MAX_PACKET_BYTES = sizeof(Frame) + 7;
  uint8_t request_[MAX_PACKET_BYTES + 1] = {};  // Extra byte for decoded form NUL.
  size_t requestSize_ = 0;
  size_t expectedRequestSize_ = 0;
  bool requestTooLarge_ = false;
  bool requestComplete_ = false;
  bool requestRejected_ = false;
  RequestParsing::FormFields form_;
  bool active_ = false;
  bool apStarted_ = false;
  bool routerReported_ = false;
  IPAddress reportedRouterIP_;
  RouterConnectionPolicy routerPolicy_{WiFiConfig::ROUTER_CONNECT_TIMEOUT_MS,
                                       WiFiConfig::ROUTER_RETRY_MS};
};

}  // namespace Matrix
