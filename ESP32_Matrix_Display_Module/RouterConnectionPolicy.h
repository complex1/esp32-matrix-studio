#pragma once

#include <stdint.h>

namespace Matrix {

enum class RouterPhase : uint8_t { Disabled, Connecting, Connected, Backoff };
enum class RouterAction : uint8_t { None, BeginSTA, CancelSTA };

// Scheduling only: the caller performs Wi-Fi operations and supplies whether
// the station currently has a usable IP. The access point is independent.
class RouterConnectionPolicy {
 public:
  RouterConnectionPolicy(uint32_t timeoutMs, uint32_t retryMs)
      : timeoutMs_(timeoutMs), retryMs_(retryMs) {}

  RouterAction begin(uint32_t now, bool configured) {
    phase_ = configured ? RouterPhase::Connecting : RouterPhase::Disabled;
    phaseStartedAt_ = now;
    return configured ? RouterAction::BeginSTA : RouterAction::None;
  }

  RouterAction step(uint32_t now, bool hasValidIP) {
    if (phase_ == RouterPhase::Disabled) return RouterAction::None;

    // A DHCP result observed at the timeout boundary wins over cancellation.
    if (hasValidIP) {
      phase_ = RouterPhase::Connected;
      return RouterAction::None;
    }

    switch (phase_) {
      case RouterPhase::Connecting:
        if (uint32_t(now - phaseStartedAt_) >= timeoutMs_) {
          phase_ = RouterPhase::Backoff;
          phaseStartedAt_ = now;
          return RouterAction::CancelSTA;
        }
        break;
      case RouterPhase::Connected:
        phase_ = RouterPhase::Connecting;
        phaseStartedAt_ = now;
        return RouterAction::BeginSTA;
      case RouterPhase::Backoff:
        if (uint32_t(now - phaseStartedAt_) >= retryMs_) {
          phase_ = RouterPhase::Connecting;
          phaseStartedAt_ = now;
          return RouterAction::BeginSTA;
        }
        break;
      case RouterPhase::Disabled:
        break;
    }
    return RouterAction::None;
  }

  RouterPhase phase() const { return phase_; }

 private:
  const uint32_t timeoutMs_;
  const uint32_t retryMs_;
  uint32_t phaseStartedAt_ = 0;
  RouterPhase phase_ = RouterPhase::Disabled;
};

}  // namespace Matrix
