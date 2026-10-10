# Matrix Studio · ESP32 20×15

This Arduino project accepts a **15-row × 20-column RGB frame** and displays it on your 300 WS2812B LEDs. The caller uses visual coordinates `frame.pixels[y][x]`; the display module handles your serpentine wiring.

The embedded mobile-friendly studio has digital/analog clocks, a countdown timer,
60 procedural effects, live pixel drawing, scrolling text, local image conversion,
and a frame-animation editor with 10 sample animations. Wi-Fi starts autonomous
playback on the ESP32; the browser can then close. USB supports manual pixels,
commands, and frames. Demo previews work without connecting any hardware.

## Build configuration

Tested with ESP32 Arduino core 3.3.11 and FastLED 3.10.6. For the confirmed 4 MB
ESP32, select **ESP32 Dev Module**, **Flash Size: 4MB**, and **Partition Scheme:
No OTA (2MB APP/2MB SPIFFS)** (`PartitionScheme=no_ota`). The older 1 MB app
partition is too small for this complete build. No OTA update is included; upload
over USB. This app embeds its web files and does not store a filesystem image.

## Wiring and coordinates

- `(0, 0)` is the visible top-left; `(19, 14)` is the bottom-right.
- Data enters the **bottom of the rightmost column** (physical C1). It runs up C1, down C2, and snakes across to C20 at the left.
- Physical LED indices: top-left `285`, top-right `14`, bottom-left `299`, bottom-right `0`.
- A standalone diagonal calibration test showed five misplaced column pairs: **1↔2, 3↔4, 5↔6, 11↔12, 13↔14** (visual columns numbered from the left, starting at 0). `MatrixDisplay.cpp` applies their inverse lookup before the original vertical-snake index calculation. That earlier calibration sketch is a local historical reference and is not included in this repository. For a differently wired panel, establish the physical order with controlled `PIXEL`/`CORNERS` tests before changing this lookup.
- `DATA_PIN` is **GPIO25** in `MatrixDisplay.h`, matching your confirmed current wiring. If you later move the data wire to **RX2/GPIO16**, change `DATA_PIN` to `16` before uploading. These pin choices are alternatives, not interchangeable.
- Connect the LED power supply ground and ESP32 ground together. Power the strip from a suitable 5 V supply, not from an ESP32 GPIO pin.

## Control it over Wi-Fi

Upload `ESP32_Matrix_Display_Module.ino` once with this updated firmware. It starts
by joining your configured router, if any, and also starts its own fallback
hotspot. Both addresses serve the complete Matrix Studio page. Public defaults
select hotspot-only operation; set private values before normal use.

Copy `WiFiConfig.local.example.h` to `WiFiConfig.local.h` in this sketch folder.
The local copy is ignored by Git. Configure `MATRIX_WIFI_AP_SSID`,
`MATRIX_WIFI_AP_PASSWORD` (8–63 characters), and
`MATRIX_WIFI_CONTROL_PASSCODE`. To join a 2.4 GHz router, also set
`MATRIX_WIFI_ROUTER_SSID` and `MATRIX_WIFI_ROUTER_PASSWORD`. Do not commit the
local file or publish screenshots/logs containing credentials. `WiFiConfig.h`
loads these overrides and otherwise supplies public setup placeholders.

### Startup / idle screen

- While joining the router, the panel shows blinking `WIFI` and dots on black.
- Once connected, it shows the **last two IP parts**, not just the final two
  digits: for example, `192.168.1.42` appears as `1.42`. Open that full URL from a
  phone/computer on the same Wi-Fi. Long suffixes such as `255.255` use two lines.
- After 15 seconds without a usable router address, the panel shows `NO WIFI`
  with a red warning. The firmware waits 30 seconds, then retries; HTTP/USB
  control and active display modes remain responsive during attempts.
- Opening/pairing the page does not remove the IP screen. The first successful
  drawing/text/pixel/mode command replaces it. Later network events never
  interrupt that content. Brightness/font settings and rejected commands keep
  the startup screen or running mode unchanged, over USB as well as Wi-Fi.
- The entire IP is printed at 115200 baud as `WIFI ROUTER URL http://<ip>` on
  connection/reconnection/address change. If your router uses a prefix other
  than `192.168`, use that full printed address instead of assuming the prefix.
- Private Wi-Fi settings are stored in your ignored `WiFiConfig.local.h` and
  compiled into the device; they are not served in the page or API. Internet
  access is not needed to use the local controller. Uploaded animations still
  live in RAM only. Do not share a firmware binary containing your credentials.

If the router is unavailable, connect directly instead:

1. Join the hotspot name and password configured in `WiFiConfig.local.h`.
   The public placeholder hotspot name is **LED-Matrix-Setup**.
2. Open **http://192.168.4.1/** in your browser. This network works without Internet;
   if your phone asks, choose to stay connected.
3. Enter the device address and your configured control passcode, then click
   **Connect matrix**. The Wi-Fi password and API passcode are separate settings
   and should both be changed from the public placeholders.
4. Choose a mode from the studio home screen. Start playback on the ESP32, or
   draw and send an image. **Try demo** previews modes without touching hardware.

The same corrected GPIO25 matrix renderer and command parser handle both Wi-Fi
and USB. The page is embedded in firmware, so the computer's local page server
does not need to run for Wi-Fi control. You can use a phone browser for Wi-Fi.
Keep the ESP32 and LED supply powered while using it wirelessly.

Leave `MATRIX_WIFI_ROUTER_SSID` empty for hotspot-only startup, which displays
`4.1` instead of a router warning. Timeout/backoff intervals can also be
overridden locally with `MATRIX_WIFI_ROUTER_CONNECT_TIMEOUT_MS` and
`MATRIX_WIFI_ROUTER_RETRY_MS`. Station/AP handling
uses the [official ESP32 Wi-Fi API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html).

The API is `GET /api/status` for JSON device information and `POST /api/send`
with `Content-Type: application/octet-stream` (or `text/plain`) for exactly one
newline-terminated ASCII command or one existing `MX` binary packet. Replies
are the existing `OK ...` or `ERR ...` lines. Frames retain CRC validation.
Every API request requires the `X-Matrix-Passcode` header. This is a local-network
controller over plain HTTP, not an Internet-facing service. Do not forward its
port publicly. Open the app directly on the ESP32 to avoid HTTPS-to-HTTP browser
restrictions; a private ESP IP is not reachable from another network without a
separate VPN or relay.
For example, from a terminal connected to the matrix network:

```sh
curl -H 'X-Matrix-Passcode: <your-passcode>' http://192.168.4.1/api/status
curl -H 'X-Matrix-Passcode: <your-passcode>' -H 'Content-Type: text/plain' --data-binary 'TEXT HELLO' http://192.168.4.1/api/send
```

When editing the web page, regenerate its embedded assets before compiling:

```sh
node scripts/embed_web.mjs
node scripts/embed_web.mjs --check
```

`WiFi.h` and `WebServer.h` come with the ESP32 Arduino core; no additional Wi-Fi
library is required. This version uses the raw HTTP body callback from ESP32
Arduino core 3.x (built with 3.3.11) to preserve zero bytes in RGB frames.

## Control it from the local web page

The `web/` folder contains the same Matrix Studio browser controller. Select
**USB serial** to keep one USB serial session open, or **Wi-Fi** and enter the
matrix address to use the wireless API. It sends the existing ASCII commands
and complete 20×15 RGB frames. USB control also works with the earlier serial-only
firmware; Wi-Fi requires uploading the updated sketch above.

From a computer terminal in this project folder, start the local page:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

Open **http://127.0.0.1:8765** in a desktop browser with Web Serial support. Select
**USB serial**, close Arduino Serial Monitor and any Python sender first, then
connect and select the ESP32 serial port. The board may restart when the port
opens. Use the drawing/image tools or the manual command console. Native clock,
effect, scrolling-text and frame-playback controls require Wi-Fi; USB can send a
single preview frame. Firmware replies appear in the connection log.

USB requires Web Serial and the loopback address provides its secure context.
Wi-Fi uses HTTP requests; if a browser blocks the local page from reaching the
matrix, open the page directly at the ESP32's address instead. Drafts autosave
in the current browser and origin; **Export draft** / **Import draft** transfer
the same 15×20 JSON frame between a computer, phone, or different page address.
An `OK FRAME` confirms reception, not that every physical LED lit; check the
matrix itself. After LED power is cycled while the ESP32 stays powered, resend a
manual frame. Autonomous modes refresh continuously, but damaged wiring or
power/data sequencing cannot be repaired in software.

For browser-module and native policy checks that do not need a board or browser
(Node.js 24 and a C++17 compiler):

```sh
node --test web/*.test.mjs
bash scripts/check-native.sh
```

The native script runs four suites with AddressSanitizer and
UndefinedBehaviorSanitizer: modes, router connection policy, serial rendering
revisions, and bounded HTTP form parsing. CI also checks that `WebAssets.h`
matches the browser source. Native tests use display/Arduino stand-ins; they do
not replace an Arduino build or physical panel observation.

## Public Pages controller

The repository's GitHub Pages workflow publishes only static browser assets from
`web/`, excluding `*.test.*`/`*.spec.*`, hidden files, links, and non-browser file
types. Firmware and `WiFiConfig.local.h` are never part of that Pages artifact.
Enable **Settings → Pages → GitHub Actions**, then push to `main` or manually run
**Publish Matrix Studio UI** on `main`. The configured URL after successful
deployment is [complex1.github.io/esp32-matrix-studio](https://complex1.github.io/esp32-matrix-studio/).

The UI can open publicly from anywhere, but a private ESP32 address still needs
the same local network or a separately secured gateway/VPN. Pages does not proxy
commands. HTTPS-to-HTTP requests and local-network permissions vary by browser;
if wireless connection is blocked, open the ESP32-hosted HTTP page directly.
Do not expose the device API through public port forwarding. USB still needs a
browser with Web Serial support. Drafts stored on one page origin must be
exported/imported to move to another.

Pull requests run a separate read-only checks workflow. The Pages workflow runs
the same validation before deployment and grants Pages/OIDC write access only
to its deployment job. All external Actions are pinned to official release
commit SHAs.

## Modes, limits, and extension points

- Clock synchronizes from the browser time and UTC offset when started; it then
  advances on the ESP32. Re-sync after a restart or daylight-saving change. It
  does not use NTP or keep an RTC across power loss.
- Timer accepts 1 second to 24 hours and gently pulses when finished.
- The effect catalog contains exactly 60 IDs (`0..59`), with matching browser
  previews in `web/effects.mjs` and native renderers in `MatrixEffects.h`.
- Marquee accepts 1–240 printable ASCII characters at scale 1 or 2. Hindi/UTF-8
  glyphs are not included in the 3×5 font. Manual serial text remains 95 bytes.
- Image import is local to the browser: fit/crop, smoothing and background
  controls produce exactly 20×15 RGB pixels. No image is uploaded to a cloud.
- Frame animations have 1–48 frames (900 bytes each), a 50–2000 ms frame interval,
  and optional looping. Drawings/animations autosave in the browser and can be
  exported as JSON. Uploaded animation frames live in ESP RAM, not persistent
  flash; restart requires re-upload. All frames must arrive and pass CRC before
  playback starts.
- All 10 built-in frame animations now have true-black/off backgrounds rather
  than a dim blue sky/water fill. Foreground scenery, stars, paths and trails
  retain their colors. Custom/imported frames are never recolored. Previously
  saved preset copies keep their old pixels; reload the preset from the updated
  page and upload it again to replace those old frames.
- A successful manual rendering command/frame takes over from an autonomous
  mode. Brightness/font settings preserve playback. **Stop display** stops and
  clears the matrix; the `mode=manual` API alone retains the last image.

`ModeEngine.h/.cpp` own non-blocking device playback. `WiFiControl.cpp` validates
and authenticates mode requests. `web/app.js` owns mode navigation, while
`pixels.mjs`, `effects.mjs`, `presets.mjs`, and `transport.mjs` isolate drawing,
catalogs, examples, and connections. New modes can be added without changing
the coordinate renderer. After web changes regenerate `WebAssets.h`.

Native mode endpoints use `application/x-www-form-urlencoded`:

| Endpoint | Fields |
| --- | --- |
| `POST /api/mode` | `mode=manual` to stop; clock: `mode=clock,epoch,offset,style=digital\|analog,hour12=0\|1,color,bg`; timer: `mode=timer,seconds,color,bg`; effect: `mode=effect,id,speed,color`; text: `mode=text,text,speed,scale,color,bg`. Colors are six hex digits without `#`. |
| `POST /api/frames/reset` | `count=1..48`; begins a new RAM upload. |
| `POST /api/frames/frame` | One binary `MXF` packet, `Content-Type: application/octet-stream`, `X-Frame-Index: 0..47`. |
| `POST /api/frames/start` | `interval=50..2000,loop=0\|1`; rejects incomplete uploads. |

The passcode is kept in browser memory for the current connection, not saved
with drafts. Defaults are for private DIY testing; change them using overrides
in the ignored `WiFiConfig.local.h` before sharing the controller
with other people.

### Previous Matrix Studio baseline verification · 10 October 2026

- Final ESP32 build: 1,099,591 bytes / 2,097,152 app bytes (52%). Global RAM:
  56,456 bytes (17%); this excludes dynamic Wi-Fi and animation allocations.
- USB upload to the connected ESP32-D0WD-V3 wrote and hash-verified
  the firmware and new partition table, then reset successfully.
- A subsequent live USB studio session received `OK FRAME` from the board.
- All 17 browser-module tests passed. Native mode and HTTP form-parser tests
  passed under AddressSanitizer/UndefinedBehaviorSanitizer, including every
  effect, frame completeness, timer completion, bounds and millis rollover.
- Browser QA covered phone-width layout, effect search, analog clock, a
  36-frame bird/forest preview, and JPEG conversion to 20×15. No browser errors
  were reported during these checks.
- A separate phone-to-ESP Wi-Fi mode run and visible LED behavior still need
  confirmation on the real panel. Upload/acknowledgment alone cannot confirm
  physical output, power quality, or every calibrated coordinate.

### Router startup / black-background update verification · 10 October 2026

- New build: 1,101,795 / 2,097,152 app bytes (52%); global RAM 55,600 bytes
  (16%). Same GPIO25 renderer, mapping, GRB order and no-OTA partition.
- Uploaded to the connected ESP32-D0WD-V3; bootloader, partition and app hashes
  verified. Captured `BOOT NETWORK IP SUFFIX v1`, router connection and its
  assigned IP suffix after reset. Router addresses are assigned by DHCP and
  can change on a later startup; use the current serial output.
- The real HTTP status API confirmed router connection; unauthenticated status
  returned 401. The ESP-served `presets.mjs` SHA-256 matched the updated source.
- All 19 browser-module tests and four native sanitizer suites passed: modes,
  router policy, serial render revision, and HTTP form parser. Tests cover all
  65,536 IP suffix pairs, black background pixels in every preset frame, timeout,
  backoff, rollover, and display ownership after commands.
- The ESP-hosted page opened successfully. The physical idle IP screen and new
  animation appearance still require the user's panel observation; logs and
  source checks are not a substitute for that. Existing uploaded/saved frames
  need reloading from the new preset to receive the black-background correction.

## Use the display module in Arduino code

Open `ESP32_Matrix_Display_Module.ino` in Arduino IDE. Install the **FastLED** library and select your ESP32 board. The sketch now shows connection status and the assigned IP suffix at startup, replacing the old blue demo frame. Send `CORNERS` when you want the four-corner wiring test.

To render any complete frame in firmware:

```cpp
Matrix::Frame image{};  // pixels[y][x], 15 rows and 20 columns
image.pixels[0][0] = {255, 0, 0};  // top-left red
image.pixels[14][19] = {0, 0, 255};  // bottom-right blue
display.showFrame(image);
```

`showFrame()` replaces all 300 LED colors and calls `FastLED.show()` once. Values are RGB integers from 0 to 255. The initial global brightness is 16/255; `MAX_BRIGHTNESS` is capped at 64 for testing.

## Test one pixel over USB serial

After uploading the sketch, open **Arduino Serial Monitor** at **115200 baud** with the line ending set to **Newline** (or **Both NL & CR**). Send one line at a time:

```text
PIXEL 19 14
PIXEL 0 0 255 0 0
CLEAR
```

`PIXEL <x> <y> [r g b]` clears the matrix, then lights only that visual coordinate. `x` ranges from `0` to `19` left-to-right, and `y` ranges from `0` to `14` top-to-bottom. RGB values range from `0` to `255`; omitting them uses white (`255 255 255`). The first example should light the bottom-right LED and reply `OK PIXEL INDEX 0 PIN 25`; the second should light the top-left LED red and reply `OK PIXEL INDEX 285 PIN 25` with the current GPIO25 setting. If you change `DATA_PIN` to `16`, the reply will say `PIN 16` instead. `CLEAR` turns every LED off.

The reply confirms the firmware parsed the command and selected the expected array index; it does **not** confirm that the physical LED lit. If the reply appears but no LED lights, check `DATA_PIN`, the LED 5 V supply, common ground, and the strip's **DIN** connection. If an LED lights in the wrong location, the physical wiring order may differ from the coordinate map above.

After uploading this corrected display-module sketch, `PIXEL 1 7` should now light visual column 1 and `PIXEL 2 7` visual column 2. The diagonal photo supports the column swaps above, but it samples only one row in each column, so test additional `y` values before assuming every cell is calibrated.

The existing Python sender can issue the same command from a **computer terminal** (not Arduino Serial Monitor):

```sh
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT command PIXEL 19 14
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT command PIXEL 0 0 255 0 0
```

Install its dependency with `python3 -m pip install -r requirements.txt`, and close Serial Monitor before running it so Python can open the port. The actual serial port name may differ on your computer.

## Display text and numbers over USB serial

Open **Arduino Serial Monitor**, set **115200 baud** and the line ending to **Newline** or **Both NL & CR**. Type one command per line, for example:

```text
TEXT HELLO
NUMBER 12345
COLOR 0 255 0
BG 0 0 8
POS 0 0
FONT 1 1 1
BRIGHTNESS 16
CLEAR
CORNERS
```

| Command | Effect |
| --- | --- |
| `TEXT <message>` | Render text using the current font, colors, and position. |
| `NUMBER <value>` | Render a numeric value, such as `123.45`, with the same font; accepts digits, `+ - . : /`, spaces, and `|` for a line break. |
| `COLOR <r> <g> <b>` | Set the text color; each component is `0..255`. |
| `BG <r> <g> <b>` | Set the background color; each component is `0..255`. |
| `POS <x> <y>` | Set the text start position; `x=0..19`, `y=0..14`. |
| `FONT <scale> <letterSpacing> <lineSpacing>` | Configure the font: scale `1..3`, spacing values `0..4`. |
| `BRIGHTNESS <value>` | Set global LED brightness to `1..64`. |
| `PIXEL <x> <y> [r g b]` | Clear all LEDs and light exactly one pixel; RGB defaults to white. |
| `CLEAR` | Clear the LEDs. |
| `CORNERS` | Show the four coordinate-test pixels. |

The font is a compact **3×5 pixel** font. Its default settings are white text on black at `(0, 0)`, scale `1`, letter spacing `1`, and line spacing `1`. It supports `A-Z`, `0-9`, spaces, and `. , : ! ? - + / = _ '`. Lowercase letters display as uppercase; other unsupported characters display as `?`. This version accepts **plain ASCII only**, so UTF-8/Hindi glyphs are not supported. Use `|` in `TEXT` for an explicit new line; long text also wraps automatically across the 20-column display. At the default settings, up to five characters fit per row and two full rows fit; content below the 15-row display is clipped, not scrolled. Spacing values scale with the font size. `COLOR`, `BG`, `POS`, and `FONT` change settings for the next `TEXT` or `NUMBER` render; they do not redraw the current image. Text and number values must not be empty. Commands use printable ASCII and are limited to **95 characters before the newline**. The ESP32 replies with `OK TEXT`, `OK NUMBER`, etc., or an `ERR ...` message if a command is invalid.

For the Python sender, first install `pyserial` with `python3 -m pip install -r requirements.txt`. It can issue one text command without manually typing the newline:

```sh
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT command TEXT HELLO
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT command NUMBER 12345
python3 send_frame.py --dry-run command FONT 2 1 1
```

To change settings and render text in **one serial session**, use `batch` with each complete command quoted:

```sh
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT batch 'COLOR 255 0 0' 'FONT 2 1 1' 'TEXT HI'
python3 send_frame.py --dry-run batch 'BG 0 0 8' 'NUMBER 123.45'
```

The sender appends the newline to every command and prints each `OK ...` reply. `--dry-run` checks printable ASCII and length locally; the ESP32 checks command names and argument ranges. Run the sender in a **computer terminal**, not inside Arduino Serial Monitor. Close Serial Monitor first so Python can open the port. Each separate Python invocation opens the port afresh, which may reboot some ESP32 boards and reset previously chosen `COLOR`, `BG`, `POS`, or `FONT` settings; `batch` avoids reopening between commands. Entering several commands in one Serial Monitor session works too.

## Send a frame over USB serial

The ESP32 listens at **115200 baud**. After installing the sender dependency above, send a solid low-intensity color:

```sh
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT solid 0 0 64
```

To send your own image, save a JSON array with exactly **15 rows**, each with **20 `[red, green, blue]` pixels**, then run:

```sh
python3 send_frame.py --port /dev/cu.usbserial-YOURPORT json my_frame.json
```

Example pixel positions in that array: `frame[0][0]` is top-left and `frame[14][19]` is bottom-right. The first row is the top row. The ESP32 returns `OK FRAME` when a frame passes validation and is displayed. Close Arduino Serial Monitor before using the sender, because only one program can normally hold the port.

For a local packet check that does not require the ESP32 or pyserial:

```sh
python3 send_frame.py --dry-run solid 255 0 0
```

The binary packet format is `MX` + `F` + little-endian payload length (`900`) + 900 RGB bytes in row-major order + little-endian CRC-16/CCITT-FALSE of the command, length, and payload. `SerialFrameReceiver` also supports clear, corner-test, and brightness commands internally.

If uploading succeeds but nothing lights, first confirm the actual data pin, LED 5 V supply, common ground, and that the data wire is connected to **DIN** rather than DOUT. Compilation or uploading alone does not verify the physical LEDs.
