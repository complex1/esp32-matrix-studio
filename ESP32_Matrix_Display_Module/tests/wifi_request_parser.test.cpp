#include "../WiFiRequestParser.h"

#include <assert.h>
#include <stdio.h>
#include <string>
#include <vector>

using Matrix::RequestParsing::FormFields;
using Matrix::RequestParsing::replacesDisplay;

static bool parse(FormFields &form, const std::string &input, std::vector<uint8_t> &buffer) {
  buffer.assign(input.begin(), input.end());
  buffer.push_back(0);
  return form.parse(buffer.data(), input.size(), buffer.size());
}

int main() {
  FormFields form;
  std::vector<uint8_t> body;
  assert(parse(form, "mode=text&text=A%26B%3DC+%2B+%25&speed=50&scale=1&color=ffffff&bg=000000", body));
  assert(strcmp(form.get("mode"), "text") == 0);
  assert(strcmp(form.get("text"), "A&B=C + %") == 0);
  assert(strcmp(form.get("bg"), "000000") == 0);
  assert(strcmp(form.get("absent"), "") == 0);
  assert(parse(form, "mode=clock&epoch=1791644400&offset=-330&hour12=1&style=analog&color=ffffff&bg=000000", body));
  assert(strcmp(form.get("offset"), "-330") == 0);

  for (const std::string invalid : {"", "=value", "mode", "mode=manual&", "mode=manual&&speed=1", "mode=text&mode=manual", "mode=text&text=%", "mode=text&text=%2", "mode=text&text=%gg", "mode=text&text=%00", "mode=text&text=%0A", "mode=text&text=%C3%A9", "bad+key=x"}) {
    assert(!parse(form, invalid, body));
  }
  std::string many;
  for (int i = 0; i < 13; ++i) many += (i ? "&" : "") + std::string("k") + std::to_string(i) + "=x";
  assert(!parse(form, many, body));
  assert(!parse(form, "abcdefghijklmnopqrstuvwxy=x", body));

  const std::string full = "text=" + std::string(902, 'A');
  assert(full.size() == 907);
  assert(parse(form, full, body));
  assert(strlen(form.get("text")) == 902);
  assert(!form.parse(body.data(), 907, 907));  // Final decoded NUL needs space.

  for (const std::string command : {"TEXT HELLO\n", "NUMBER 123", "  pixel 1 2 3 4 5", "CLEAR", "corners"}) {
    assert(replacesDisplay(reinterpret_cast<const uint8_t *>(command.data()), command.size()));
  }
  for (const std::string command : {"BRIGHTNESS 16", "COLOR 1 2 3", "BG 0 0 0", "POS 1 2", "FONT 1 1 1", "TEXTUAL", ""}) {
    assert(!replacesDisplay(reinterpret_cast<const uint8_t *>(command.data()), command.size()));
  }
  for (const char command : {'F', 'C', 'K', 'B'}) {
    const uint8_t packet[] = {'M', 'X', static_cast<uint8_t>(command), 0, 0};
    assert(replacesDisplay(packet, sizeof(packet)) == (command != 'B'));
  }
  puts("Wi-Fi form parsing and manual rendering tests passed.");
}
