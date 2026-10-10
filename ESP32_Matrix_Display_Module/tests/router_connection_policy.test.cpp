#include "../RouterConnectionPolicy.h"

#include <assert.h>
#include <stdio.h>

using Matrix::RouterAction;
using Matrix::RouterConnectionPolicy;
using Matrix::RouterPhase;

int main() {
  {
    RouterConnectionPolicy policy(15000, 30000);
    assert(policy.phase() == RouterPhase::Disabled);
    assert(policy.step(0, false) == RouterAction::None);
    assert(policy.begin(100, false) == RouterAction::None);
    assert(policy.step(100000, true) == RouterAction::None);
    assert(policy.phase() == RouterPhase::Disabled);
  }
  {
    RouterConnectionPolicy policy(15000, 30000);
    assert(policy.begin(100, true) == RouterAction::BeginSTA);
    assert(policy.phase() == RouterPhase::Connecting);
    // A driver failure is represented by no valid IP. It does not retry early.
    assert(policy.step(101, false) == RouterAction::None);
    assert(policy.step(15099, false) == RouterAction::None);
    assert(policy.step(15100, false) == RouterAction::CancelSTA);
    assert(policy.phase() == RouterPhase::Backoff);
    assert(policy.step(15101, false) == RouterAction::None);
    assert(policy.step(45099, false) == RouterAction::None);
    assert(policy.step(45100, false) == RouterAction::BeginSTA);
    assert(policy.phase() == RouterPhase::Connecting);
    assert(policy.step(45101, false) == RouterAction::None);
    assert(policy.step(60099, false) == RouterAction::None);
    assert(policy.step(60100, false) == RouterAction::CancelSTA);
  }
  {
    RouterConnectionPolicy policy(15000, 30000);
    assert(policy.begin(0, true) == RouterAction::BeginSTA);
    assert(policy.step(15000, true) == RouterAction::None);
    assert(policy.phase() == RouterPhase::Connected);
    assert(policy.step(20000, true) == RouterAction::None);
    assert(policy.step(21000, false) == RouterAction::BeginSTA);
    assert(policy.phase() == RouterPhase::Connecting);
    assert(policy.step(21001, false) == RouterAction::None);
    assert(policy.step(35999, false) == RouterAction::None);
    assert(policy.step(36000, false) == RouterAction::CancelSTA);
    // A usable IP can still be observed while waiting for the next attempt.
    assert(policy.step(36001, true) == RouterAction::None);
    assert(policy.phase() == RouterPhase::Connected);
    assert(policy.step(37000, false) == RouterAction::BeginSTA);
    assert(policy.step(37001, true) == RouterAction::None);
    assert(policy.phase() == RouterPhase::Connected);
    assert(policy.begin(40000, false) == RouterAction::None);
    assert(policy.phase() == RouterPhase::Disabled);
    assert(policy.step(100000, true) == RouterAction::None);
  }
  {
    RouterConnectionPolicy policy(15000, 30000);
    const uint32_t started = 0xfffff000U;
    assert(policy.begin(started, true) == RouterAction::BeginSTA);
    assert(policy.step(uint32_t(started + 14999U), false) == RouterAction::None);
    assert(policy.step(uint32_t(started + 15000U), false) == RouterAction::CancelSTA);
    assert(policy.step(uint32_t(started + 44999U), false) == RouterAction::None);
    assert(policy.step(uint32_t(started + 45000U), false) == RouterAction::BeginSTA);
    assert(policy.step(uint32_t(started + 45010U), true) == RouterAction::None);
    assert(policy.step(uint32_t(started + 45011U), false) == RouterAction::BeginSTA);
    assert(policy.step(uint32_t(started + 60010U), false) == RouterAction::None);
    assert(policy.step(uint32_t(started + 60011U), false) == RouterAction::CancelSTA);
  }
  puts("Router connection policy boundary, retry, reconnect and rollover tests passed.");
}
