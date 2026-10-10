#pragma once
#include <stdint.h>

// Copy WiFiConfig.local.example.h to WiFiConfig.local.h for private device values.
#if defined(__has_include)
#if __has_include("WiFiConfig.local.h")
#include "WiFiConfig.local.h"
#endif
#endif

// Public setup placeholders; override these locally before normal use.
#ifndef MATRIX_WIFI_AP_SSID
#define MATRIX_WIFI_AP_SSID "LED-Matrix-Setup"
#endif
#ifndef MATRIX_WIFI_AP_PASSWORD
#define MATRIX_WIFI_AP_PASSWORD "change-this-wifi"
#endif
#ifndef MATRIX_WIFI_CONTROL_PASSCODE
#define MATRIX_WIFI_CONTROL_PASSCODE "change-this-control"
#endif
// Empty router SSID selects hotspot-only operation.
#ifndef MATRIX_WIFI_ROUTER_SSID
#define MATRIX_WIFI_ROUTER_SSID ""
#endif
#ifndef MATRIX_WIFI_ROUTER_PASSWORD
#define MATRIX_WIFI_ROUTER_PASSWORD ""
#endif
#ifndef MATRIX_WIFI_ROUTER_CONNECT_TIMEOUT_MS
#define MATRIX_WIFI_ROUTER_CONNECT_TIMEOUT_MS 15000
#endif
#ifndef MATRIX_WIFI_ROUTER_RETRY_MS
#define MATRIX_WIFI_ROUTER_RETRY_MS 30000
#endif

namespace Matrix {
namespace WiFiConfig {
constexpr char AP_SSID[] = MATRIX_WIFI_AP_SSID;
constexpr char AP_PASSWORD[] = MATRIX_WIFI_AP_PASSWORD;
constexpr char CONTROL_PASSCODE[] = MATRIX_WIFI_CONTROL_PASSCODE;
constexpr char ROUTER_SSID[] = MATRIX_WIFI_ROUTER_SSID;
constexpr char ROUTER_PASSWORD[] = MATRIX_WIFI_ROUTER_PASSWORD;
constexpr uint32_t ROUTER_CONNECT_TIMEOUT_MS = MATRIX_WIFI_ROUTER_CONNECT_TIMEOUT_MS;
constexpr uint32_t ROUTER_RETRY_MS = MATRIX_WIFI_ROUTER_RETRY_MS;
}  // namespace WiFiConfig
}  // namespace Matrix
