#include "WiFiControl.h"

#include <WiFi.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "WiFiConfig.h"
#include "WebAssets.h"

namespace Matrix {

namespace {
bool number(const String &value, uint32_t minimum, uint32_t maximum, uint32_t &out) {
  if (value.length() == 0 || value.length() > 10) return false;
  uint64_t parsed = 0;
  for (size_t i = 0; i < value.length(); ++i) {
    if (!isdigit(static_cast<unsigned char>(value[i]))) return false;
    parsed = parsed * 10 + (value[i] - '0');
    if (parsed > maximum) return false;
  }
  if (parsed < minimum) return false;
  out = static_cast<uint32_t>(parsed);
  return true;
}

bool color(const String &value, Color &out) {
  if (value.length() != 6) return false;
  for (size_t i = 0; i < 6; ++i) if (!isxdigit(static_cast<unsigned char>(value[i]))) return false;
  const unsigned long packed = strtoul(value.c_str(), nullptr, 16);
  out = {static_cast<uint8_t>(packed >> 16), static_cast<uint8_t>(packed >> 8), static_cast<uint8_t>(packed)};
  return true;
}

uint16_t crc16(const uint8_t *data, size_t size) {
  uint16_t crc = 0xffff;
  for (size_t i = 0; i < size; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
  }
  return crc;
}
}  // namespace

void WiFiControl::addCors() {
  server_.sendHeader("Access-Control-Allow-Origin", "*");
  server_.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server_.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Matrix-Passcode, X-Frame-Index");
  server_.sendHeader("Access-Control-Allow-Private-Network", "true");
  server_.sendHeader("Cache-Control", "no-store");
}

void WiFiControl::error(int statusCode, const char *message) {
  addCors();
  server_.send(statusCode, "text/plain", message);
}

void WiFiControl::status() {
  if (!authorize()) return;
  addCors();
  String json = "{\"name\":\"Matrix-ESP32\",\"width\":20,\"height\":15,\"pin\":";
  json += DATA_PIN;
  json += ",\"brightness\":";
  json += display_.brightness();
  json += ",\"mode\":\"";
  json += modes_.modeName();
  json += "\",\"effect\":";
  json += modes_.effectId();
  json += ",\"frameCount\":";
  json += modes_.frameCount();
  json += ",\"routerConnected\":";
  json += WiFi.status() == WL_CONNECTED ? "true" : "false";
  json += ",\"apIP\":\"";
  json += WiFi.softAPIP().toString();
  json += "\",\"routerIP\":\"";
  if (WiFi.status() == WL_CONNECTED) json += WiFi.localIP().toString();
  json += "\"}";
  server_.send(200, "application/json", json);
}

void WiFiControl::receiveRaw() {
  const String type = server_.header("Content-Type");
  // WebServer invokes this callback for multipart uploads as well as raw data.
  // In that case raw() is absent: reject before ever accessing it.
  if (type.startsWith("multipart/")) {
    server_.beginEarlyReply();
    rejectRaw(415, "ERR CONTENT TYPE\n");
    return;
  }
  // arg("plain") truncates binary data at zero bytes in Arduino WebServer.
  // Its raw callback preserves all bytes and bounds the request buffer.
  HTTPRaw &raw = server_.raw();
  switch (raw.status) {
    case RAW_START:
      requestSize_ = 0;
      expectedRequestSize_ = 0;
      requestTooLarge_ = false;
      requestComplete_ = false;
      requestRejected_ = false;
      server_.beginEarlyReply();
      if (!authorize()) {
        requestRejected_ = true;
        server_.client().stop();
        break;
      }
      {
        const String path = server_.uri();
        const bool formRoute = path == "/api/mode" || path == "/api/frames/reset" || path == "/api/frames/start";
        const bool acceptedType = formRoute ? type.startsWith("application/x-www-form-urlencoded") :
            (path == "/api/frames/frame" ? type.startsWith("application/octet-stream") :
             type.startsWith("application/octet-stream") || type.startsWith("text/plain"));
        if (!acceptedType) { rejectRaw(415, "ERR CONTENT TYPE\n"); break; }
        uint32_t length = 0;
        if (!number(server_.header("Content-Length"), 1, 4294967295UL, length)) {
          rejectRaw(400, "ERR CONTENT LENGTH\n");
          break;
        }
        if (length > MAX_PACKET_BYTES) {
          requestTooLarge_ = true;
          rejectRaw(413, "ERR PACKET TOO LARGE\n");
          break;
        }
        expectedRequestSize_ = length;
      }
      break;
    case RAW_WRITE:
      if (requestRejected_) break;
      if (raw.currentSize > MAX_PACKET_BYTES - requestSize_) {
        requestTooLarge_ = true;
        rejectRaw(413, "ERR PACKET TOO LARGE\n");
      } else if (!requestTooLarge_) {
        memcpy(request_ + requestSize_, raw.buf, raw.currentSize);
        requestSize_ += raw.currentSize;
      }
      break;
    case RAW_END:
      requestComplete_ = !requestRejected_ && !requestTooLarge_ && requestSize_ == expectedRequestSize_;
      break;
    case RAW_ABORTED:
      requestComplete_ = false;
      break;
  }
}

void WiFiControl::rejectRaw(int statusCode, const char *message) {
  requestComplete_ = false;
  requestRejected_ = true;
  error(statusCode, message);
  // Stop the parser's read loop, rather than draining a rejected large body.
  server_.client().stop();
}

bool WiFiControl::prepareForm() {
  if (!authorize()) return false;
  if (!server_.header("Content-Type").startsWith("application/x-www-form-urlencoded")) {
    error(415, "ERR CONTENT TYPE\n");
    return false;
  }
  if (!requestComplete_ || requestTooLarge_ || requestRejected_ || requestSize_ == 0) {
    error(400, "ERR FORM BODY\n");
    return false;
  }
  requestComplete_ = false;
  if (!form_.parse(request_, requestSize_, sizeof(request_))) {
    error(400, "ERR FORM\n");
    return false;
  }
  return true;
}

String WiFiControl::formArg(const char *name) const { return String(form_.get(name)); }

void WiFiControl::processRequest() {
  if (!authorize()) return;
  const String type = server_.header("Content-Type");
  if (!type.startsWith("application/octet-stream") && !type.startsWith("text/plain")) {
    requestComplete_ = false;
    return error(415, "ERR CONTENT TYPE\n");
  }
  if (requestTooLarge_) return error(413, "ERR PACKET TOO LARGE\n");
  if (!requestComplete_ || requestSize_ == 0) {
    return error(400, "ERR EMPTY PACKET\n");
  }
  requestComplete_ = false;

  const bool binary = requestSize_ >= 2 && request_[0] == 'M' && request_[1] == 'X';
  const bool replacesDisplay = RequestParsing::replacesDisplay(request_, requestSize_);
  if (binary) {
    if (requestSize_ < 7) return error(400, "ERR HEADER\n");
    const uint8_t command = request_[2];
    const uint16_t payloadLength = request_[3] | (static_cast<uint16_t>(request_[4]) << 8);
    const bool validHeader = (command == 'F' && payloadLength == sizeof(Frame)) ||
                            (command == 'B' && payloadLength == 1) ||
                            ((command == 'C' || command == 'K') && payloadLength == 0);
    if (!validHeader || requestSize_ != static_cast<size_t>(payloadLength) + 7) {
      return error(400, "ERR HEADER\n");
    }
  } else {
    // Exactly one printable command per request, optionally ending in CR/LF.
    while (requestSize_ && (request_[requestSize_ - 1] == '\n' || request_[requestSize_ - 1] == '\r')) {
      --requestSize_;
    }
    if (requestSize_ == 0 || requestSize_ > 95) return error(400, "ERR LINE TOO LONG\n");
    for (size_t i = 0; i < requestSize_; ++i) {
      if (request_[i] < 32 || request_[i] > 126) return error(400, "ERR ASCII\n");
    }
    request_[requestSize_++] = '\n';
  }

  receiver_.resetInput();
  commandStream_.begin(request_, requestSize_);
  receiver_.poll();
  receiver_.resetInput();
  const char *reply = commandStream_.reply();
  if (*reply == '\0') return error(400, "ERR PACKET\n");
  if (strncmp(reply, "OK", 2) == 0 && replacesDisplay) modes_.stop();
  addCors();
  server_.send(strncmp(reply, "OK", 2) == 0 ? 200 : 400, "text/plain", reply);
}

bool WiFiControl::authorize() {
  if (WiFiConfig::CONTROL_PASSCODE[0] && server_.header("X-Matrix-Passcode") != WiFiConfig::CONTROL_PASSCODE) {
    requestComplete_ = false;
    error(401, "ERR PASSCODE\n");
    return false;
  }
  return true;
}

void WiFiControl::setMode() {
  if (!prepareForm()) return;
  const String mode = formArg("mode");
  if (mode == "manual") {
    modes_.stop();
    addCors();
    return server_.send(200, "text/plain", "OK MODE MANUAL\n");
  }
  Color foreground{}, background{};
  if (!color(formArg("color"), foreground)) return error(400, "ERR COLOR\n");
  if (mode != "effect" && !color(formArg("bg"), background)) return error(400, "ERR BG\n");
  uint32_t first = 0, second = 0;
  bool accepted = false;
  if (mode == "clock") {
    const String style = formArg("style");
    const String offset = formArg("offset");
    const bool negative = offset.startsWith("-");
    uint32_t zone = 0;
    if ((style != "digital" && style != "analog") ||
        !number(formArg("epoch"), 0, 4294967295UL, first) ||
        !number(negative ? offset.substring(1) : offset, 0, 840, zone) ||
        !number(formArg("hour12"), 0, 1, second)) return error(400, "ERR CLOCK ARGS\n");
    const int16_t minutes = negative ? -static_cast<int16_t>(zone) : static_cast<int16_t>(zone);
    accepted = modes_.startClock(first, minutes, style == "analog", second == 1, foreground, background);
  } else if (mode == "timer") {
    if (!number(formArg("seconds"), 1, 86400, first)) return error(400, "ERR TIMER ARGS\n");
    accepted = modes_.startTimer(first, foreground, background);
  } else if (mode == "effect") {
    if (!number(formArg("id"), 0, 59, first) || !number(formArg("speed"), 1, 100, second)) return error(400, "ERR EFFECT ARGS\n");
    accepted = modes_.startEffect(first, second, foreground);
  } else if (mode == "text") {
    const String text = formArg("text");
    if (text.length() == 0 || text.length() > 240 ||
        !number(formArg("speed"), 1, 100, first) || !number(formArg("scale"), 1, 2, second)) return error(400, "ERR TEXT ARGS\n");
    for (size_t i = 0; i < text.length(); ++i) if (text[i] < 32 || text[i] > 126) return error(400, "ERR ASCII\n");
    accepted = modes_.startText(text.c_str(), first, second, foreground, background);
  } else {
    return error(400, "ERR MODE\n");
  }
  if (!accepted) return error(400, "ERR MODE ARGS\n");
  addCors();
  server_.send(200, "text/plain", "OK MODE " + mode + "\n");
}

void WiFiControl::resetFrames() {
  if (!prepareForm()) return;
  uint32_t count = 0;
  if (!number(formArg("count"), 1, 48, count)) return error(400, "ERR FRAME COUNT\n");
  if (!modes_.beginFrames(count)) return error(503, "ERR FRAME MEMORY\n");
  addCors();
  server_.send(200, "text/plain", "OK FRAMES RESET\n");
}

void WiFiControl::saveFrame() {
  if (!authorize()) return;
  const String type = server_.header("Content-Type");
  if (!type.startsWith("application/octet-stream")) return error(415, "ERR CONTENT TYPE\n");
  uint32_t index = 0;
  if (!number(server_.header("X-Frame-Index"), 0, 47, index)) return error(400, "ERR FRAME INDEX\n");
  if (!requestComplete_ || requestTooLarge_ || requestSize_ != MAX_PACKET_BYTES) return error(400, "ERR FRAME SIZE\n");
  requestComplete_ = false;
  if (request_[0] != 'M' || request_[1] != 'X' || request_[2] != 'F' ||
      request_[3] != (sizeof(Frame) & 255) || request_[4] != (sizeof(Frame) >> 8)) return error(400, "ERR HEADER\n");
  const uint16_t received = request_[905] | (static_cast<uint16_t>(request_[906]) << 8);
  if (crc16(request_ + 2, sizeof(Frame) + 3) != received) return error(400, "ERR CRC\n");
  Frame frame;
  memcpy(&frame, request_ + 5, sizeof(frame));
  if (!modes_.setFrame(index, frame)) return error(400, "ERR FRAME INDEX\n");
  addCors();
  server_.send(200, "text/plain", "OK FRAME SAVED\n");
}

void WiFiControl::startFrames() {
  if (!prepareForm()) return;
  uint32_t interval = 0, loop = 0;
  if (!number(formArg("interval"), 50, 2000, interval) || !number(formArg("loop"), 0, 1, loop)) return error(400, "ERR ANIMATION ARGS\n");
  if (!modes_.startFrames(interval, loop == 1)) return error(400, "ERR FRAMES INCOMPLETE\n");
  addCors();
  server_.send(200, "text/plain", "OK MODE ANIMATION\n");
}

void WiFiControl::begin() {
  // A single nonblocking policy owns reconnects. Keep the hotspot available
  // throughout router attempts, timeout, and backoff.
  WiFi.persistent(false);  // Credentials are in firmware; retries need no NVS writes.
  WiFi.setAutoReconnect(false);
  WiFi.setHostname("matrix-esp32");
  WiFi.mode(WiFiConfig::ROUTER_SSID[0] ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  apStarted_ = WiFi.softAP(WiFiConfig::AP_SSID, WiFiConfig::AP_PASSWORD);
  if (!apStarted_) {
    Serial.println("ERR WIFI AP START");
  }
  if (routerPolicy_.begin(millis(), WiFiConfig::ROUTER_SSID[0] != '\0') == RouterAction::BeginSTA) {
    beginRouterAttempt();
  } else if (apStarted_) {
    const IPAddress ip = WiFi.softAPIP();
    modes_.updateNetworkStatus(ModeEngine::NetworkState::Connected, ip[2], ip[3]);
  } else {
    modes_.updateNetworkStatus(ModeEngine::NetworkState::Unavailable);
  }

  const auto serve = [this](const char *type, const uint8_t *data, size_t length) {
    server_.sendHeader("Content-Encoding", "gzip");
    server_.sendHeader("Cache-Control", "no-cache");
    server_.send_P(200, type, reinterpret_cast<const char *>(data), length);
  };
  const char *requestHeaders[] = {"Content-Type", "Content-Length", "X-Matrix-Passcode", "X-Frame-Index"};
  server_.collectHeaders(requestHeaders, 4);
  for (const auto &asset : WebAssets::assets) {
    const auto *entry = &asset;
    server_.on(entry->path, HTTP_GET, [serve, entry]() { serve(entry->type, entry->data, entry->length); });
    if (strcmp(entry->path, "/index.html") == 0) {
      server_.on("/", HTTP_GET, [serve, entry]() { serve(entry->type, entry->data, entry->length); });
    }
  }
  server_.on("/api/status", HTTP_GET, [this]() { status(); });
  server_.on("/api/send", HTTP_POST, [this]() { processRequest(); }, [this]() { receiveRaw(); });
  server_.on("/api/mode", HTTP_POST, [this]() { setMode(); }, [this]() { receiveRaw(); });
  server_.on("/api/frames/reset", HTTP_POST, [this]() { resetFrames(); }, [this]() { receiveRaw(); });
  server_.on("/api/frames/frame", HTTP_POST, [this]() { saveFrame(); }, [this]() { receiveRaw(); });
  server_.on("/api/frames/start", HTTP_POST, [this]() { startFrames(); }, [this]() { receiveRaw(); });
  server_.on("/api/status", HTTP_OPTIONS, [this]() { addCors(); server_.send(204); });
  server_.on("/api/send", HTTP_OPTIONS, [this]() { addCors(); server_.send(204); });
  for (const char *path : {"/api/mode", "/api/frames/reset", "/api/frames/frame", "/api/frames/start"}) {
    server_.on(path, HTTP_OPTIONS, [this]() { addCors(); server_.send(204); });
  }
  server_.onNotFound([this]() { error(404, "ERR NOT FOUND\n"); });
  server_.begin();
  active_ = true;
  if (apStarted_) {
    Serial.print("WIFI AP ");
    Serial.print(WiFiConfig::AP_SSID);
    Serial.print(" URL http://");
    Serial.println(WiFi.softAPIP());
  }
}

void WiFiControl::poll() {
  if (active_) server_.handleClient();
  pollRouter();
}

void WiFiControl::beginRouterAttempt() {
  Serial.print("WIFI ROUTER CONNECTING ");
  Serial.println(WiFiConfig::ROUTER_SSID);
  WiFi.begin(WiFiConfig::ROUTER_SSID, WiFiConfig::ROUTER_PASSWORD);
}

void WiFiControl::pollRouter() {
  if (routerPolicy_.phase() == RouterPhase::Disabled) return;
  const IPAddress ip = WiFi.localIP();
  const bool connected = WiFi.status() == WL_CONNECTED && ip != IPAddress(0, 0, 0, 0);
  const RouterAction action = routerPolicy_.step(millis(), connected);
  if (action == RouterAction::CancelSTA) {
    // Neither turn off the AP nor erase stored settings on a timeout.
    WiFi.disconnectAsync(false, false);
    Serial.print("WARN WIFI ROUTER UNAVAILABLE; retry in ");
    Serial.print(WiFiConfig::ROUTER_RETRY_MS / 1000);
    Serial.println(apStarted_ ? " seconds. Hotspot stays available." : " seconds. Hotspot failed to start.");
  } else if (action == RouterAction::BeginSTA) {
    beginRouterAttempt();
  }
  switch (routerPolicy_.phase()) {
    case RouterPhase::Connected:
      if (!routerReported_ || ip != reportedRouterIP_) {
        routerReported_ = true;
        reportedRouterIP_ = ip;
        Serial.print("WIFI ROUTER URL http://");
        Serial.println(ip);
        Serial.print("WIFI DISPLAY IP ");
        Serial.print(ip[2]); Serial.print('.'); Serial.println(ip[3]);
      }
      modes_.updateNetworkStatus(ModeEngine::NetworkState::Connected, ip[2], ip[3]);
      break;
    case RouterPhase::Connecting:
      routerReported_ = false;
      modes_.updateNetworkStatus(ModeEngine::NetworkState::Connecting);
      break;
    case RouterPhase::Backoff:
      routerReported_ = false;
      modes_.updateNetworkStatus(ModeEngine::NetworkState::Unavailable);
      break;
    default: break;
  }
}

}  // namespace Matrix
